"""Small deterministic local images for browser regression; no network fixtures."""
import struct
import zlib


def chunk(kind, payload):
    return (struct.pack('>I', len(payload)) + kind + payload
            + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))


def png_image(width=256, height=160, transparent=False, animated=False):
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(((x * 13 + y * 17) % 256, (x * 3 + y * 11) % 256,
                         (x * 7 + y * 5) % 256, 0 if transparent else 255))
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + (chunk(b'acTL', struct.pack('>II', 2, 0)) if animated else b'')
            + chunk(b'IDAT', zlib.compress(bytes(rows), 0)) + chunk(b'IEND', b''))


def upload(name='photo.png', **options):
    return {'name': name, 'mimeType': 'image/png', 'buffer': png_image(**options)}
