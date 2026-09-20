"""Render actual RentSketch meshes as crisp model artwork with ambient occlusion.
Requires Mitsuba 3.9.1, numpy and Pillow. Export the scene first with
scripts/export-marketing-scene.cjs. This is model artwork, not a WebGL screenshot.
"""
from pathlib import Path
import json,os
import mitsuba as mi
import drjit as dr
import numpy as np
from PIL import Image
mi.set_variant('llvm_ad_rgb')
class ModelPreview(mi.SamplingIntegrator):
    def __init__(self,props): super().__init__(props)
    def sample(self,scene,sampler,ray,medium=None,active=True):
        si=scene.ray_intersect(ray,active=active);valid=si.is_valid() & active
        normal=dr.select(dr.dot(si.sh_frame.n,ray.d)>0,-si.sh_frame.n,si.sh_frame.n)
        probe=si.spawn_ray(mi.Frame3f(normal).to_world(mi.warp.square_to_cosine_hemisphere(sampler.next_2d())))
        probe.maxt=3.0
        clear=~scene.ray_test(probe,active=valid)
        color=si.bsdf().eval_diffuse_reflectance(si,active=valid)
        # Broad studio light keeps the tent interior legible, as in the browser.
        key=dr.abs(dr.dot(normal,dr.normalize(mi.Vector3f(-.35,.8,.65))))
        shade=(.62+.38*key)*dr.select(clear,1,.70)
        sky=mi.Color3f(.62,.77,.87)
        return dr.select(valid,color*shade,sky),mi.Bool(True),[]
    def to_string(self):return 'RentSketchModelPreview'
mi.register_integrator('rentsketch_model',lambda props:ModelPreview(props))
root=Path(__file__).resolve().parents[1]
source=Path(os.environ.get('RENTSKETCH_SCENE_DIR','/tmp/rentsketch-hero'))
data=json.loads((source/'scene.json').read_text())
width=int(os.environ.get('RENTSKETCH_RENDER_WIDTH','1440'));height=round(width/1.44)
spp=int(os.environ.get('RENTSKETCH_RENDER_SAMPLES','96'))
scene={'type':'scene','integrator':{'type':'rentsketch_model'},
 'sensor':{'type':'perspective','fov':data['camera']['fov'],'fov_axis':'y','to_world':mi.ScalarTransform4f().look_at(origin=data['camera']['position'],target=data['camera']['target'],up=[0,1,0]),'film':{'type':'hdrfilm','width':width,'height':height,'rfilter':{'type':'tent'}},'sampler':{'type':'independent','sample_count':spp}}}
for i,m in enumerate(data['materials']):
 scene['mesh_'+str(i)]={'type':'ply','filename':str(source/m['filename']),'bsdf':{'type':'twosided','material':{'type':'diffuse','reflectance':{'type':'rgb','value':np.clip(m['color'],.003,.98).tolist()}}}}
print('Rendering real model geometry:',data['total'],'triangles;',width,'x',height,';',spp,'samples',flush=True)
a=np.asarray(mi.render(mi.load_dict(scene),spp=spp,seed=27))
a=np.clip(a,0,1);a=np.where(a<=.0031308,a*12.92,1.055*np.power(a,1/2.4)-.055)
im=Image.fromarray(np.rint(a*255).astype('uint8'),'RGB')
preview=source/'reception-preview.png';im.save(preview)
if width>=1440:
 im.save(root/'assets/event-reception-3d.webp',quality=88,method=6)
 im.resize((720,500),Image.Resampling.LANCZOS).save(root/'assets/event-reception-3d-mobile.webp',quality=84,method=6)
print('Saved',preview,flush=True)
