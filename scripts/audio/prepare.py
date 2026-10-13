"""Trim generated recordings, make circular loops, normalize and export browser formats."""
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "artifacts/audio/raw"
WORK = ROOT / "artifacts/audio/processed"
DEST = ROOT / "public/audio"
DESIGN = json.loads((ROOT / "art/audio/sound-design.json").read_text(encoding="utf-8"))


def activity(audio, sample_rate):
    width = max(1, int(sample_rate * 0.02))
    padded = np.pad(audio.mean(axis=1), (0, (-len(audio)) % width))
    energy = np.sqrt(np.mean(padded.reshape(-1, width) ** 2, axis=1))
    return energy, width


def circular(audio, frames):
    frames = min(frames, len(audio) // 4)
    blend = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, frames)))[:, None]
    return np.concatenate([audio[frames:-frames], audio[-frames:] * (1 - blend) + audio[:frames] * blend])


def prepare(spec, music):
    source = RAW / (spec["id"] + ".wav")
    receipt = json.loads(source.with_suffix(".json").read_text(encoding="utf-8"))
    matches = (receipt.get("request", {}).get("prompt") == spec["prompt"] and receipt["request"].get("seed") == spec["seed"]) if music else (receipt.get("seed") == spec["seed"] and all(spec[key] in receipt.get("prompt", "") for key in ["caption", "sfx"]))
    if not matches:
        raise ValueError(f"Master prompt/seed changed for {spec['id']}; run generate.py with --force")
    audio, rate = sf.read(source, always_2d=True, dtype="float32")
    if not np.isfinite(audio).all() or np.std(audio) < 1e-5:
        raise ValueError(f"Invalid source {source}")
    audio -= audio.mean(axis=0, keepdims=True)
    energy, width = activity(audio, rate)
    audible = np.flatnonzero(energy > max(0.0001, float(energy.max()) * 0.025))
    if not len(audible):
        raise ValueError(f"Silent source {source}")
    first, last = max(0, audible[0] * width - int(.04 * rate)), min(len(audio), (audible[-1] + 1) * width + int(.12 * rate))
    loop = music or spec.get("loop", False)
    if loop:
        audio = audio[first:last]
        if not music:
            audio = audio[:int(spec["duration"] * rate)]
        if len(audio) / rate < (20 if music else 2):
            raise ValueError(f"Generated loop too short: {spec['id']}")
        audio = circular(audio, int((3 if music else .65) * rate))
    else:
        # Chimes keep their melodic attack; percussive cues use the strongest clean transient.
        start = first if spec["id"] == "evolve" else max(first, int(np.argmax(energy) * width - .08 * rate))
        audio = audio[start:min(last, start + int(spec["duration"] * rate))]
        first, last = start, start + len(audio)
        fade_in, fade_out = min(int(.008 * rate), len(audio) // 8), min(int(.1 * rate), len(audio) // 4)
        audio[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
        audio[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    if not music:
        audio = audio.mean(axis=1, keepdims=True)
    target = .055 if music else .036 if loop else .1
    gain = min(target / max(1e-5, float(np.sqrt(np.mean(audio ** 2)))), .7 / max(1e-5, float(np.abs(audio).max())))
    audio *= gain
    working = WORK / (spec["id"] + ".wav")
    sf.write(working, audio, rate, subtype="PCM_24")
    files = {}
    for extension, codec in [("ogg", ["-c:a", "libvorbis", "-q:a", "3"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "5"])]:
        output = DEST / f"{spec['id']}.{extension}"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(working), "-ar", "44100", *codec, str(output)], check=True)
        encoded, sr = sf.read(output, always_2d=True)
        if not np.isfinite(encoded).all() or np.max(np.abs(encoded)) > .98:
            raise ValueError(f"Encoded audio clipped: {output}")
        files[extension] = {"bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "duration": round(len(encoded) / sr, 4), "peak_dbfs": round(20 * np.log10(max(1e-9, float(np.abs(encoded).max()))), 2)}
    result = {"id": spec["id"], "role": "music" if music else "ambience" if loop else "effect", "loop": loop,
              "generator": "ACE-Step 1.5" if music else "Dasheng-AudioGen", "seed": spec["seed"],
              "prompt": spec.get("prompt") or spec["caption"] + " " + spec["sfx"],
              "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "source_seconds": len(sf.read(source)[0]) / rate,
              "selected_seconds": [round(first / rate, 3), round(last / rate, 3)],
              "processing": "DC-free gain normalization with peak ceiling; circular cosine crossfade" if loop else "Isolated transient, short attack/release fades, peak and RMS normalization",
              "duration": round(len(audio) / rate, 4), "channels": audio.shape[1], "rms_dbfs": round(20 * np.log10(max(1e-9, float(np.sqrt(np.mean(audio ** 2))))), 2),
              "seam_delta": round(float(np.max(np.abs(audio[0] - audio[-1]))), 6) if loop else None, "files": files}
    print(f"PREPARED {spec['id']}: {result['duration']}s {result['rms_dbfs']} dBFS", flush=True)
    return result


if __name__ == "__main__":
    WORK.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    entries = []
    for category in ["music", "effects"]:
        for spec in DESIGN[category]:
            if (RAW / (spec["id"] + ".wav")).exists():
                entries.append(prepare(spec, category == "music"))
    manifest = {"version": 1, "runtime": "Static local assets, decoded in the browser after a user gesture.",
                "generators": {"ACE-Step 1.5": {"revision": "ca1e85fe9430179831e6bc6be790c332190a3866", "model": "acestep-v15-turbo", "license": "MIT"},
                               "Dasheng-AudioGen": {"revision": "3ff4ee42670692ebd5c731d5ba15e399ff5cc514", "model": "mispeech/Dasheng-AudioGen", "license": "Apache-2.0"}},
                "validation": "This script checks waveforms, clipping, duration, file hashes and loop boundaries. Browser playback is verified separately in tests/audio-browser.mjs. Prompts describe generation intent.",
                "files": entries}
    (DEST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
