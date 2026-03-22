"""
VeldrixAI Report Name Generator
Produces unique, premium RunPod-style two/three-word names for every PDF report.
"""

import random
import hashlib
import string
from datetime import datetime

ADJECTIVES = [
    "Cobalt", "Void", "Iron", "Amber", "Forge", "Crimson", "Onyx", "Silver",
    "Quiet", "Nova", "Polar", "Cipher", "Steel", "Drift", "Zenith", "Axon",
    "Vantage", "Sable", "Lunar", "Prism", "Obsidian", "Halo", "Nimbus",
    "Ferric", "Quartz", "Slate", "Vertex", "Tidal", "Boreal", "Stratum",
    "Fractal", "Basalt", "Auric", "Cerulean", "Helios", "Flux", "Relic",
    "Specter", "Mantis", "Velvet", "Torque", "Celeste", "Monolith", "Apex",
    "Stygian", "Ferrous", "Glacial", "Halcyon", "Obsidian", "Perihelion",
]

NOUNS = [
    "Nexus", "Meridian", "Sentinel", "Lattice", "Protocol", "Vector",
    "Threshold", "Epoch", "Bastion", "Storm", "Cortex", "Axis", "Prism",
    "Relay", "Horizon", "Kernel", "Manifold", "Signal", "Datum", "Cipher",
    "Beacon", "Matrix", "Scaffold", "Conduit", "Orbital", "Stratum", "Ledger",
    "Vortex", "Pillar", "Circuit", "Anchor", "Canopy", "Vertex", "Reactor",
    "Fulcrum", "Archive", "Gateway", "Spectra", "Cascade", "Tempest",
    "Array", "Quorum", "Citadel", "Keystone", "Rampart", "Parallax",
    "Continuum", "Inflection", "Tessera", "Terminus",
]

THREE_WORD_MIDDLES = [
    "Zero", "Deep", "Dark", "High", "Core", "Peak", "Edge", "Far",
    "Raw", "True", "Wide", "Low", "Near", "Hard", "Soft", "Prime",
    "Pure", "Bold", "Keen", "Null",
]


def generate_report_name(existing_names: list[str] | None = None, seed: str | None = None) -> str:
    """
    Generate a unique two-word premium report name.
    Falls back to three words if collision detected after 20 attempts.
    """
    existing = set(existing_names or [])
    rng = random.Random(seed or datetime.utcnow().isoformat())

    for _ in range(20):
        adj = rng.choice(ADJECTIVES)
        noun = rng.choice(NOUNS)
        name = f"{adj} {noun}"
        if name not in existing:
            return name

    for _ in range(20):
        adj = rng.choice(ADJECTIVES)
        mid = rng.choice(THREE_WORD_MIDDLES)
        noun = rng.choice(NOUNS)
        name = f"{adj} {mid} {noun}"
        if name not in existing:
            return name

    h = hashlib.md5(datetime.utcnow().isoformat().encode()).hexdigest()[:4].upper()
    return f"Cobalt {h} Nexus"


def generate_vx_report_id() -> str:
    """Generate a short, sortable VeldrixAI report ID: VX-YYYYMMDD-XXXX"""
    date = datetime.utcnow().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"VX-{date}-{suffix}"
