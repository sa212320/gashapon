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


def graph_to3d(image_name, prefix, faces=50000, texture=2048, seed=42):
    """Pixal3D + TRELLIS.2 圖轉 3D:單張圖 → 帶貼圖的 GLB(存在 ComfyUI output/3d/)。
    照官方範本 3d_pixal3d_trellis2_image_to_model 的預設路徑(Pixal3D 模型、MoGe 估視角),
    但只烤 base color,不接 AO / 法線貼圖(站上平塗,不打光),並把面數壓到 faces。
    減面用 qem:midpoint 壓到 2 萬面時臉和尾巴會整片崩掉,qem 在 2 萬面仍完整。"""
    pixal = ['1', 0]
    return {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'pixal3d_int8_convrot.safetensors', 'weight_dtype': 'default'}},
        '2': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'trellis_2_shape_vae_bf16.safetensors'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'trellis_2_texture_vae_bf16.safetensors'}},
        '4': {'class_type': 'CLIPVisionLoader', 'inputs': {'clip_name': 'dino_v3_L_naf_fp32.safetensors'}},
        '5': {'class_type': 'LoadMoGeModel', 'inputs': {'model_name': 'moge_2_vitl_normal_fp16.safetensors'}},
        '6': {'class_type': 'LoadBackgroundRemovalModel', 'inputs': {'bg_removal_name': 'birefnet.safetensors'}},
        # 去背 → 以主體為中心裁成 1024 方圖(黑底)
        '10': {'class_type': 'LoadImage', 'inputs': {'image': image_name}},
        '11': {'class_type': 'RemoveBackground', 'inputs': {'bg_removal_model': ['6', 0], 'image': ['10', 0]}},
        '12': {'class_type': 'ImageCropToMask', 'inputs': {'images': ['10', 0], 'masks': ['11', 0], 'width': 1024, 'height': 1024, 'pad_factor': 1.1, 'grow_mask': 0, 'background': '#000000'}},
        '13': {'class_type': 'MoGeInference', 'inputs': {'moge_model': ['5', 0], 'image': ['12', 0], 'resolution_level': 9, 'fov_x_degrees': 0.0, 'batch_size': 4, 'force_projection': True, 'apply_mask': True, 'refine_steps': 3}},
        '14': {'class_type': 'MoGeGeometryToFOV', 'inputs': {'moge_geometry': ['13', 0], 'axis': 'horizontal', 'unit': 'degrees'}},
        '15': {'class_type': 'Pixal3DConditioning', 'inputs': {'clip_vision_model': ['4', 0], 'image': ['12', 0], 'camera_angle_x': ['14', 0]}},
        # 1. 結構(體素)
        '20': {'class_type': 'CFGOverride', 'inputs': {'model': pixal, 'cfg': 1.0, 'start_percent': 0.667, 'end_percent': 1.0}},
        '21': {'class_type': 'RescaleCFG', 'inputs': {'model': ['20', 0], 'multiplier': 0.7}},
        '22': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['21', 0], 'shift': 5.0}},
        '23': {'class_type': 'EmptyTrellis2LatentStructure', 'inputs': {'batch_size': 1}},
        '24': {'class_type': 'KSampler', 'inputs': {'model': ['22', 0], 'seed': seed + 14, 'steps': 12, 'cfg': 7.5, 'sampler_name': 'euler', 'scheduler': 'normal', 'positive': ['15', 0], 'negative': ['15', 1], 'latent_image': ['23', 0], 'denoise': 1.0}},
        '25': {'class_type': 'VaeDecodeStructureTrellis2', 'inputs': {'samples': ['24', 0], 'vae': ['2', 0], 'resolution': '32'}},
        # 2. 形狀(先低解析,再放大到 1536)
        '30': {'class_type': 'CFGOverride', 'inputs': {'model': pixal, 'cfg': 1.0, 'start_percent': 0.769, 'end_percent': 1.0}},
        '31': {'class_type': 'RescaleCFG', 'inputs': {'model': ['30', 0], 'multiplier': 0.5}},
        '32': {'class_type': 'Trellis2ShapeStage', 'inputs': {'positive': ['15', 0], 'negative': ['15', 1], 'voxel': ['25', 0]}},
        '33': {'class_type': 'KSampler', 'inputs': {'model': ['31', 0], 'seed': seed, 'steps': 20, 'cfg': 7.5, 'sampler_name': 'euler', 'scheduler': 'normal', 'positive': ['32', 0], 'negative': ['32', 1], 'latent_image': ['32', 2], 'denoise': 1.0}},
        '34': {'class_type': 'Trellis2UpsampleStage', 'inputs': {'positive': ['32', 0], 'negative': ['32', 1], 'shape_latent': ['33', 0], 'vae': ['2', 0], 'target_resolution': '1536'}},
        '35': {'class_type': 'KSampler', 'inputs': {'model': ['31', 0], 'seed': seed, 'steps': 12, 'cfg': 7.5, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['34', 0], 'negative': ['34', 1], 'latent_image': ['34', 2], 'denoise': 1.0}},
        '36': {'class_type': 'VaeDecodeShapeTrellis', 'inputs': {'samples': ['35', 0], 'vae': ['2', 0]}},
        # 3. 顏色(體素色)
        '40': {'class_type': 'Trellis2TextureStage', 'inputs': {'positive': ['34', 0], 'negative': ['34', 1], 'shape_latent': ['35', 0]}},
        '41': {'class_type': 'KSampler', 'inputs': {'model': pixal, 'seed': seed + 1, 'steps': 12, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'normal', 'positive': ['40', 0], 'negative': ['40', 1], 'latent_image': ['40', 2], 'denoise': 1.0}},
        '42': {'class_type': 'VaeDecodeTextureTrellis', 'inputs': {'samples': ['41', 0], 'vae': ['3', 0], 'shape_subdivides': ['36', 1]}},
        # 4. 網格整理 → 展 UV → 烤 base color → GLB
        '50': {'class_type': 'RemeshMesh', 'inputs': {'mesh': ['36', 0], 'resolution': 768, 'sign_mode': 'udf', 'sign_mode.qef': False, 'sign_mode.drop_inverted_components': False, 'sign_mode.drop_enclosed_components': False, 'band': 1.0, 'project_back': 0.0, 'fix_poles': False, 'smooth_iters': 20, 'drop_small_components': 0.01, 'precluster_max_verts': 20000000}},
        '51': {'class_type': 'DecimateMesh', 'inputs': {'mesh': ['50', 0], 'target_face_count': faces, 'placement_mode': 'qem', 'placement_mode.line_quadric_weight': 0.0, 'placement_mode.feature_edge_quadric_weight': 0.0, 'placement_mode.feature_edge_min_dihedral_deg': 30.0, 'placement_mode.clamp_v_to_edge': True}},
        '52': {'class_type': 'MeshSmoothNormals', 'inputs': {'mesh': ['51', 0], 'crease_angle': 180.0}},
        '53': {'class_type': 'UnwrapMesh', 'inputs': {'mesh': ['52', 0], 'segmenter': 'pec', 'resolution': texture, 'padding': 1, 'weld_distance': 0.0002}},
        '54': {'class_type': 'BakeTextureFromVoxel', 'inputs': {'mesh': ['53', 0], 'voxel_colors': ['42', 0], 'texture_size': texture, 'reference_mesh': ['36', 0]}},
        '55': {'class_type': 'ApplyTextureToMesh', 'inputs': {'mesh': ['53', 0], 'base_color': ['54', 0]}},
        '56': {'class_type': 'SaveGLB', 'inputs': {'mesh': ['55', 0], 'filename_prefix': f'3d/{prefix}'}},
        '57': {'class_type': 'PreviewImage', 'inputs': {'images': ['12', 0]}},
    }
