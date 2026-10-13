"""Generate original island audio with the user's installed ACE-Step and Dasheng models."""
import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DESIGN = json.loads((ROOT / "art/audio/sound-design.json").read_text(encoding="utf-8"))
LAB = Path(os.environ.get("SPECIES_AUDIO_LAB", str(Path.home() / "audio-lab/edict-engine-audio")))
OUTPUT = ROOT / "artifacts/audio/raw"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def post(url, payload):
    request = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    with OPENER.open(request, timeout=120) as response:
        return json.load(response)


def music(base, force=False):
    for spec in DESIGN["music"]:
        output = OUTPUT / (spec["id"] + ".wav")
        if output.exists() and not force:
            continue
        request = {"prompt": spec["prompt"], "lyrics": "[Instrumental]", "thinking": False,
                   "sample_mode": False, "use_format": False, "use_cot_caption": False,
                   "use_cot_language": False, "model": "acestep-v15-turbo", "vocal_language": "unknown",
                   "bpm": spec["bpm"], "key_scale": spec["key"], "time_signature": "4",
                   "audio_duration": spec["duration"], "inference_steps": 8, "use_random_seed": False,
                   "seed": spec["seed"], "batch_size": 1, "task_type": "text2music", "audio_format": "wav"}
        task = post(base + "/release_task", request)["data"]["task_id"]
        print(f"GENERATING {spec['id']} task={task}", flush=True)
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            items = post(base + "/query_result", {"task_id_list": [task]}).get("data") or []
            if items and int(items[0].get("status", 0)) == 1:
                result = json.loads(items[0]["result"])[0]
                with OPENER.open(urllib.parse.urljoin(base + "/", result["file"]), timeout=120) as response:
                    output.write_bytes(response.read())
                output.with_suffix(".json").write_text(json.dumps({"generator": "ACE-Step 1.5", "request": request, "result": result}, indent=2), encoding="utf-8")
                print(f"READY {spec['id']}", flush=True)
                break
            if items and int(items[0].get("status", 0)) == 2:
                raise RuntimeError(items[0])
            time.sleep(5)
        else:
            raise TimeoutError(f"Generation deadline: {spec['id']}")


def effects(force=False):
    import torch
    import soundfile as sf
    from transformers import AutoModel
    if not torch.xpu.is_available():
        raise RuntimeError("The installed Intel XPU environment is required")
    print("Loading local Dasheng-AudioGen", flush=True)
    dtype = torch.bfloat16
    model = AutoModel.from_pretrained(LAB / "dasheng-audiogen/model", trust_remote_code=True,
                                     torch_dtype=dtype, low_cpu_mem_usage=True, local_files_only=True).eval()
    model.to(device="xpu", dtype=dtype)
    # Preserve the locally validated Intel precision boundary.
    model.backbone.to(device="xpu", dtype=torch.float32)
    model.audio_tokenizer.decoder.to(device="xpu", dtype=torch.float32)
    if model.audio_tokenizer.upsampler is not None:
        model.audio_tokenizer.upsampler.to(device="xpu", dtype=torch.float32)
    for spec in DESIGN["effects"]:
        output = OUTPUT / (spec["id"] + ".wav")
        if output.exists() and not force:
            continue
        torch.manual_seed(spec["seed"])
        torch.xpu.manual_seed_all(spec["seed"])
        prompt = model.compose_prompt(caption=spec["caption"], sfx=spec["sfx"])
        print(f"GENERATING {spec['id']}", flush=True)
        with torch.inference_mode():
            audio = model.generate(prompts=prompt, num_steps=25, guidance_scale=5.0, sway_sampling_coef=-1.0).float()
        if audio.ndim == 1:
            audio = audio.unsqueeze(0)
        if not torch.isfinite(audio).all() or audio.std().item() < 1e-6:
            raise RuntimeError(f"Invalid generated waveform: {spec['id']}")
        peak = audio.abs().max().item()
        if peak > 0.98:
            audio = audio * (0.98 / peak)
        sf.write(output, audio.cpu().numpy().T, 16000, subtype="PCM_16")
        output.with_suffix(".json").write_text(json.dumps({"generator": "Dasheng-AudioGen", "seed": spec["seed"], "prompt": prompt, "steps": 25, "guidance": 5.0, "precision": "BF16 text; FP32 denoiser and decoder"}, indent=2), encoding="utf-8")
        print(f"READY {spec['id']} samples={audio.shape[-1]}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["music", "effects"])
    parser.add_argument("--base", default="http://127.0.0.1:18001")
    parser.add_argument("--force", action="store_true", help="Regenerate existing masters after changing sound-design.json")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    music(args.base, args.force) if args.stage == "music" else effects(args.force)
