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


def graph_t2i(prompt, negative, width, height, seed, prefix, steps=9):
    """z_image turbo 文字生圖(Lumina2 架構:qwen_3_4b 文字編碼、ae VAE、AuraFlow 取樣)。
    turbo 版用 cfg 1,負面提示詞其實不起作用,這裡仍照接,換成非 turbo 版時才有效。"""
    return {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'z_image_turbo_bf16.safetensors', 'weight_dtype': 'default'}},
        '2': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_3_4b.safetensors', 'type': 'lumina2', 'device': 'default'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'ae.safetensors'}},
        '4': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['1', 0], 'shift': 3.0}},
        '5': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['2', 0], 'text': prompt}},
        '6': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['2', 0], 'text': negative}},
        '7': {'class_type': 'EmptySD3LatentImage', 'inputs': {'width': width, 'height': height, 'batch_size': 1}},
        '8': {'class_type': 'KSampler', 'inputs': {'model': ['4', 0], 'seed': seed, 'steps': steps, 'cfg': 1.0, 'sampler_name': 'res_multistep', 'scheduler': 'simple', 'positive': ['5', 0], 'negative': ['6', 0], 'latent_image': ['7', 0], 'denoise': 1.0}},
        '9': {'class_type': 'VAEDecode', 'inputs': {'samples': ['8', 0], 'vae': ['3', 0]}},
        '10': {'class_type': 'SaveImage', 'inputs': {'images': ['9', 0], 'filename_prefix': prefix}},
    }


def graph_i2i(image_name, prompt, negative, seed, prefix, denoise, steps=9):
    """z_image 圖生圖:以已上傳的 image_name 為起點,denoise 決定改動幅度(越大改越多)。
    用來讓一組素材共用同一個底(例如 5 個等級的外框),只在細節上逐級變化。"""
    return {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'z_image_turbo_bf16.safetensors', 'weight_dtype': 'default'}},
        '2': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_3_4b.safetensors', 'type': 'lumina2', 'device': 'default'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'ae.safetensors'}},
        '4': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['1', 0], 'shift': 3.0}},
        '5': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['2', 0], 'text': prompt}},
        '6': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['2', 0], 'text': negative}},
        '7': {'class_type': 'LoadImage', 'inputs': {'image': image_name}},
        '11': {'class_type': 'VAEEncode', 'inputs': {'pixels': ['7', 0], 'vae': ['3', 0]}},
        '8': {'class_type': 'KSampler', 'inputs': {'model': ['4', 0], 'seed': seed, 'steps': steps, 'cfg': 1.0, 'sampler_name': 'res_multistep', 'scheduler': 'simple', 'positive': ['5', 0], 'negative': ['6', 0], 'latent_image': ['11', 0], 'denoise': denoise}},
        '9': {'class_type': 'VAEDecode', 'inputs': {'samples': ['8', 0], 'vae': ['3', 0]}},
        '10': {'class_type': 'SaveImage', 'inputs': {'images': ['9', 0], 'filename_prefix': prefix}},
    }


def graph_edit(ref_names, prompt, seed, prefix, steps=25, resolution=1024):
    """Qwen Image 2.1 編輯/照參考圖畫:ref_names 是已上傳的參考圖(最多 16 張),
    prompt 裡用 <image1>、<image2>… 指名。輸出尺寸跟著第一張參考圖走。
    節點照官方範本 image_qwen_image_2_1_image_edit 的子圖;cfg 1 時負面提示詞不起作用。"""
    g = {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'qwen_image_2.1_int8_convrot.safetensors', 'weight_dtype': 'default'}},
        '2': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen3vl_8b_int8_convrot.safetensors', 'type': 'qwen_image', 'device': 'default'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'qwen_image_2.1_vae_bf16.safetensors'}},
        '4': {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['1', 0], 'device': 'auto', 'dtype': 'default'}},
        '5': {'class_type': 'TextEncodeQwenImage21', 'inputs': {'clip': ['2', 0], 'vae': ['3', 0], 'prompt': prompt, 'negative_prompt': '', 'resolution': resolution}},
        '6': {'class_type': 'KSampler', 'inputs': {'model': ['4', 0], 'seed': seed, 'steps': steps, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['5', 0], 'negative': ['5', 1], 'latent_image': ['5', 2], 'denoise': 1.0}},
        '7': {'class_type': 'VAEDecode', 'inputs': {'samples': ['6', 0], 'vae': ['3', 0]}},
        '8': {'class_type': 'SaveImage', 'inputs': {'images': ['7', 0], 'filename_prefix': prefix}},
    }
    for i, name in enumerate(ref_names, 1):
        g[f'10{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': name}}
        g['5']['inputs'][f'images.image_{i}'] = [f'10{i}', 0]
    return g
