"""Build the website and app icons from the approved ResearchPilot mark."""

from pathlib import Path

from PIL import Image, ImageChops


PUBLIC = Path(__file__).resolve().parents[1] / "public"
SOURCE = PUBLIC / "researchpilot-icon-master.png"
BRAND = PUBLIC / "researchpilot-logo-light.png"
SIZES = {
    "favicon-light-16.png": 16,
    "favicon-light-32.png": 32,
    "favicon-light-48.png": 48,
    "researchpilot-icon-light-32.png": 32,
    "researchpilot-icon-light-180.png": 180,
    "researchpilot-icon-light-192.png": 192,
    "researchpilot-icon-light-512.png": 512,
}


def build_mark() -> Image.Image:
    source = Image.open(SOURCE).convert("RGB")
    # Derive a clean, single-colour mark from the supplied white-background logo.
    mask = ImageChops.invert(source.convert("L"))
    mask = mask.point(lambda value: max(0, value - 18))
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError(f"No dark logo symbol found in {SOURCE}")

    mask = mask.crop(bounds)
    side = max(mask.size)
    padding = round(side * 0.16)
    canvas = Image.new("L", (side + padding * 2, side + padding * 2), 0)
    canvas.paste(mask, ((canvas.width - mask.width) // 2, (canvas.height - mask.height) // 2))

    mark = Image.new("RGB", canvas.size, "white")
    ink = Image.new("RGB", canvas.size, "#171717")
    mark.paste(ink, mask=canvas)
    return mark


def main() -> None:
    mark = build_mark()
    mark.resize((512, 512), Image.Resampling.LANCZOS).save(BRAND, optimize=True)
    for filename, size in SIZES.items():
        icon = mark.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(PUBLIC / filename, optimize=True)

    mark.resize((48, 48), Image.Resampling.LANCZOS).save(PUBLIC / "favicon-light.ico", format="ICO")


if __name__ == "__main__":
    main()
