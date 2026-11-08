from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("researchpilot.openrouter")

OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_ANALYSIS_MODEL = os.getenv("OPENROUTER_ANALYSIS_MODEL", "")
OPENROUTER_CHAT_MODEL = os.getenv("OPENROUTER_CHAT_MODEL", "")
OPENROUTER_FALLBACK_MODEL = os.getenv("OPENROUTER_FALLBACK_MODEL", "")
OPENROUTER_TIMEOUT = float(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "75"))
OPENROUTER_MAX_RETRIES = int(os.getenv("OPENROUTER_MAX_RETRIES", "2"))
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", os.getenv("SITE_URL", "http://localhost:5173"))
OPENROUTER_APP_TITLE = os.getenv("OPENROUTER_APP_TITLE", "ResearchPilot")

DEFAULT_ANALYSIS_MODEL = "google/gemini-2.5-pro"
DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash"
DEFAULT_FALLBACK_MODEL = "openai/gpt-4.1-mini"
PERMANENT_STATUS = {400, 401, 402, 403, 404}


class OpenRouterError(Exception):
    def __init__(self, message: str, *, status: int = 502, permanent: bool = False):
        super().__init__(message)
        self.message = message
        self.status = status
        self.permanent = permanent


@dataclass
class ModelSelection:
    analysis: str
    chat: str
    fallback: str
    source: str
    available: list[str]


def configured() -> bool:
    return bool(OPENROUTER_API_KEY and OPENROUTER_API_KEY.strip())


def safe_config() -> dict[str, Any]:
    return {
        "configured": configured(),
        "base_url": OPENROUTER_BASE_URL,
        "analysis_model": OPENROUTER_ANALYSIS_MODEL or DEFAULT_ANALYSIS_MODEL,
        "chat_model": OPENROUTER_CHAT_MODEL or DEFAULT_CHAT_MODEL,
        "fallback_model": OPENROUTER_FALLBACK_MODEL or DEFAULT_FALLBACK_MODEL,
        "timeout_seconds": OPENROUTER_TIMEOUT,
        "max_retries": OPENROUTER_MAX_RETRIES,
    }


def headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-OpenRouter-Title": OPENROUTER_APP_TITLE,
        "X-Title": OPENROUTER_APP_TITLE,
    }


async def fetch_models(client: httpx.AsyncClient | None = None) -> list[dict[str, Any]]:
    if not configured():
        return []
    close = client is None
    client = client or httpx.AsyncClient(timeout=min(OPENROUTER_TIMEOUT, 45))
    try:
        response = await client.get(f"{OPENROUTER_BASE_URL}/models", headers=headers())
        if response.status_code >= 400:
            log.warning("openrouter.models status=%s", response.status_code)
            return []
        data = response.json()
        return data.get("data", []) if isinstance(data, dict) else []
    except Exception as exc:
        log.warning("openrouter.models error=%s", type(exc).__name__)
        return []
    finally:
        if close:
            await client.aclose()


def _supports_structured(model: dict[str, Any]) -> bool:
    params = model.get("supported_parameters") or []
    return any("response_format" in str(p) or "structured" in str(p) for p in params)


def _score(model: dict[str, Any], *, analysis: bool) -> tuple[int, int]:
    mid = str(model.get("id", ""))
    ctx = int(model.get("context_length") or 0)
    score = 0
    if analysis:
        if "gemini-2.5-pro" in mid or "claude-sonnet" in mid or "gpt-4.1" == mid.split("/")[-1]:
            score += 40
        if "pro" in mid or "sonnet" in mid or "opus" in mid:
            score += 15
    else:
        if "flash" in mid or "mini" in mid or "gpt-4.1-mini" in mid:
            score += 35
        if "gemini-2.5-flash" in mid:
            score += 15
    if _supports_structured(model):
        score += 20
    if ctx >= 100000:
        score += 20
    elif ctx >= 32000:
        score += 8
    if ":free" in mid or mid.startswith("~"):
        score -= 5
    return (score, ctx)


async def select_models() -> ModelSelection:
    models = await fetch_models()
    by_id = {m.get("id"): m for m in models if m.get("id")}
    available = list(by_id.keys())
    explicit = {
        "analysis": OPENROUTER_ANALYSIS_MODEL or DEFAULT_ANALYSIS_MODEL,
        "chat": OPENROUTER_CHAT_MODEL or DEFAULT_CHAT_MODEL,
        "fallback": OPENROUTER_FALLBACK_MODEL or DEFAULT_FALLBACK_MODEL,
    }

    def pick(explicit_id: str, *, analysis: bool) -> str:
        if explicit_id in by_id:
            return explicit_id
        candidates = [m for m in models if _supports_structured(m) and int(m.get("context_length") or 0) >= 32000]
        candidates.sort(key=lambda m: _score(m, analysis=analysis), reverse=True)
        if candidates:
            return str(candidates[0]["id"])
        return explicit_id

    if not models:
        return ModelSelection(explicit["analysis"], explicit["chat"], explicit["fallback"], "defaults_unverified", [])
    analysis = pick(explicit["analysis"], analysis=True)
    chat = pick(explicit["chat"], analysis=False)
    fallback = explicit["fallback"] if explicit["fallback"] in by_id else (chat if chat in by_id else pick(explicit["fallback"], analysis=False))
    source = "catalog" if available else "defaults"
    return ModelSelection(analysis, chat, fallback, source, available[:50])


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str,
    fallback_model: str | None = None,
    json_mode: bool = False,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    if not configured():
        raise OpenRouterError("OpenRouter is not configured. Set OPENROUTER_API_KEY in backend/.env.", status=503, permanent=True)
    attempts = [(model, False)]
    if fallback_model and fallback_model != model:
        attempts.append((fallback_model, True))
    last: OpenRouterError | None = None
    for use_model, is_fallback in attempts:
        try:
            return await _request(messages, model=use_model, json_mode=json_mode, temperature=temperature, max_tokens=max_tokens, fallback=is_fallback)
        except OpenRouterError as exc:
            last = exc
            if exc.permanent or is_fallback:
                raise
            log.warning("openrouter.primary_failed model=%s status=%s fallback=%s", use_model, exc.status, fallback_model)
    raise last or OpenRouterError("OpenRouter request failed.")


async def _request(messages: list[dict[str, str]], *, model: str, json_mode: bool, temperature: float, max_tokens: int | None, fallback: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {"model": model, "temperature": temperature, "messages": messages}
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    retries = max(0, OPENROUTER_MAX_RETRIES)
    for attempt in range(retries + 1):
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=OPENROUTER_TIMEOUT) as client:
                response = await client.post(f"{OPENROUTER_BASE_URL}/chat/completions", json=payload, headers=headers())
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            if attempt < retries:
                await _sleep(attempt)
                continue
            log.warning("openrouter.network model=%s error=%s", model, type(exc).__name__)
            raise OpenRouterError("OpenRouter did not respond in time.", status=504) from exc
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("openrouter.request model=%s status=%s ms=%s fallback=%s", model, response.status_code, elapsed_ms, fallback)
        if response.status_code == 200:
            try:
                data = response.json()
            except Exception as exc:
                raise OpenRouterError("OpenRouter returned a malformed response.", status=502) from exc
            content = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content")
            if not isinstance(content, str):
                raise OpenRouterError("OpenRouter returned an empty completion.", status=502)
            usage = data.get("usage") or {}
            return {
                "model": data.get("model") or model,
                "content": content,
                "usage": usage,
                "status": response.status_code,
                "elapsed_ms": elapsed_ms,
                "fallback": fallback,
            }
        permanent = response.status_code in PERMANENT_STATUS
        detail = _error_detail(response)
        if response.status_code == 429 and attempt < retries:
            await _sleep(attempt, rate_limited=True)
            continue
        if response.status_code >= 500 and attempt < retries and not permanent:
            await _sleep(attempt)
            continue
        raise OpenRouterError(detail, status=502 if response.status_code >= 500 else response.status_code, permanent=permanent)
    raise OpenRouterError("OpenRouter request failed after retries.", status=502)


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
        err = body.get("error") if isinstance(body, dict) else None
        if isinstance(err, dict):
            msg = str(err.get("message") or "")
        else:
            msg = str(err or "")
    except Exception:
        msg = ""
    low = msg.lower()
    if response.status_code in (401, 403) or "auth" in low or "key" in low:
        return "OpenRouter authentication failed. Check OPENROUTER_API_KEY."
    if response.status_code == 402 or "credit" in low or "insufficient" in low:
        return "OpenRouter credits are insufficient for this request."
    if response.status_code == 404 or "model" in low and "not" in low:
        return "The configured OpenRouter model is unavailable."
    if response.status_code == 429:
        return "OpenRouter rate limit reached. Try again shortly."
    return "OpenRouter could not complete the request."


async def _sleep(attempt: int, *, rate_limited: bool = False) -> None:
    import asyncio

    base = 1.5 if rate_limited else 0.8
    await asyncio.sleep(min(base * (2 ** attempt), 6.0))
