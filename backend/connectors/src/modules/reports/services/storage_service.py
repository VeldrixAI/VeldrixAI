import hashlib


def compute_checksum(content: bytes) -> str:
    """Compute SHA256 checksum of content"""
    return hashlib.sha256(content).hexdigest()
