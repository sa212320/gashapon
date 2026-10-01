"""ComfyUI HTTP API 客戶端 + Wan 2.2 i2v 工作流圖。只用標準函式庫。"""
import io
import json
import os
import time
import urllib.parse
import urllib.request
import uuid

# 實際的 ComfyUI 在別台機器上,用 COMFY_URL 指定(例如 COMFY_URL=http://<那台的 IP>:8188)
HOST = os.environ.get('COMFY_URL', 'http://localhost:8188').rstrip('/')
W, H = 640, 576


def upload(png_bytes, name):
    boundary = uuid.uuid4().hex
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
        f'Content-Type: image/png\r\n\r\n'
    ).encode() + png_bytes + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(f'{HOST}/upload/image', body,
                                 {'Content-Type': f'multipart/form-data; boundary={boundary}'})
    return json.load(urllib.request.urlopen(req))['name']


def graph(prompt, negative, start, length, seed, prefix, end=None):
    g = {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', 'weight_dtype': 'default'}},
        '2': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors', 'weight_dtype': 'default'}},
        '3': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['1', 0], 'lora_name': 'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors', 'strength_model': 1.0}},
        '4': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['2', 0], 'lora_name': 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors', 'strength_model': 1.0}},
        '5': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['3', 0], 'shift': 5.0}},
        '6': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['4', 0], 'shift': 5.0}},
        '7': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'type': 'wan', 'device': 'default'}},
        '8': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'wan_2.1_vae.safetensors'}},
        '9': {'class_type': 'LoadImage', 'inputs': {'image': start}},
        '10': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['7', 0], 'text': prompt}},
        '11': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['7', 0], 'text': negative}},
        '13': {'class_type': 'KSamplerAdvanced', 'inputs': {'model': ['5', 0], 'add_noise': 'enable', 'noise_seed': seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['12', 0], 'negative': ['12', 1], 'latent_image': ['12', 2], 'start_at_step': 0, 'end_at_step': 2, 'return_with_leftover_noise': 'enable'}},
        '14': {'class_type': 'KSamplerAdvanced', 'inputs': {'model': ['6', 0], 'add_noise': 'disable', 'noise_seed': seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['12', 0], 'negative': ['12', 1], 'latent_image': ['13', 0], 'start_at_step': 2, 'end_at_step': 10000, 'return_with_leftover_noise': 'disable'}},
        '15': {'class_type': 'VAEDecode', 'inputs': {'samples': ['14', 0], 'vae': ['8', 0]}},
        '16': {'class_type': 'SaveImage', 'inputs': {'images': ['15', 0], 'filename_prefix': prefix}},
    }
    common = {'positive': ['10', 0], 'negative': ['11', 0], 'vae': ['8', 0], 'width': W, 'height': H, 'length': length, 'batch_size': 1}
    if end:
        g['17'] = {'class_type': 'LoadImage', 'inputs': {'image': end}}
        g['12'] = {'class_type': 'WanFirstLastFrameToVideo', 'inputs': {**common, 'start_image': ['9', 0], 'end_image': ['17', 0]}}
    else:
        g['12'] = {'class_type': 'WanImageToVideo', 'inputs': {**common, 'start_image': ['9', 0]}}
    return g


def run(g, timeout=900):
    body = json.dumps({'prompt': g, 'client_id': uuid.uuid4().hex}).encode()
    req = urllib.request.Request(f'{HOST}/prompt', body, {'Content-Type': 'application/json'})
    pid = json.load(urllib.request.urlopen(req))['prompt_id']
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = json.load(urllib.request.urlopen(f'{HOST}/history/{pid}'))
        if pid in hist:
            status = hist[pid]['status']
            if status.get('status_str') == 'error':
                raise RuntimeError(json.dumps(status)[:2000])
            return [img for out in hist[pid]['outputs'].values() for img in out.get('images', [])]
        time.sleep(3)
    raise TimeoutError(f'ComfyUI prompt {pid} 超過 {timeout}s')


def fetch(img):
    q = urllib.parse.urlencode({'filename': img['filename'], 'subfolder': img['subfolder'], 'type': img['type']})
    return urllib.request.urlopen(f'{HOST}/view?{q}').read()
