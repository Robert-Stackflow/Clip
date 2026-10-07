"""Export the approved Clipper artwork at native application and tray sizes."""

from io import BytesIO
from pathlib import Path
from struct import pack

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MASTER = Image.open(ASSETS / "clipper-master.png").convert("RGBA")


def app_icon(size: int) -> Image.Image:
    image = MASTER.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 32:
        # A restrained native-size edge correction keeps the two cards distinct
        # in Windows' 16–32 px tray and ICO representations.
        image = image.filter(ImageFilter.UnsharpMask(radius=0.55, percent=85, threshold=2))
    return image


def png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def ico(images: list[tuple[int, bytes]]) -> bytes:
    header = pack("<HHH", 0, 1, len(images))
    directory = bytearray()
    payload = bytearray()
    offset = 6 + len(images) * 16
    for size, data in images:
        directory.extend(pack("<BBBBHHII", size if size < 256 else 0,
                              size if size < 256 else 0, 0, 0, 1, 32,
                              len(data), offset))
        payload.extend(data)
        offset += len(data)
    return header + directory + payload


if __name__ == "__main__":
    for size in (16, 20, 24, 32):
        (ASSETS / f"clipper-tray-{size}.png").write_bytes(png(app_icon(size)))
    (ASSETS / "clipper-mark.png").write_bytes(png(app_icon(128)))
    (ASSETS / "clipper.png").write_bytes(png(app_icon(512)))
    (ROOT / "installer" / "icon.png").write_bytes(png(app_icon(256)))
    (ASSETS / "clipper.ico").write_bytes(
        ico([(size, png(app_icon(size)))
             for size in (16, 24, 32, 48, 64, 128, 256)])
    )
