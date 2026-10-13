"""Extend our original Blender assets into six editable descendants; never overwrite the originals."""
from pathlib import Path
import bpy
import math
import json
from mathutils import Vector

BASE = Path(__file__).resolve().parents[1]
# Reuse the project's mesh helpers without executing its original asset export / render section.
exec((BASE / 'scripts/generate_models.py').read_text(encoding='utf-8').split("hero=empty(")[0])
bpy.context.preferences.filepaths.save_version=0

specs=[('riftstalker','emberfang'),('stonehorn','mossback'),('tideblade','reefjaw'),('spearbeak','reedbeak'),('resinshell','mossback'),('stormlantern','glowbug')]
roots=[]
for index,(name,ancestor) in enumerate(specs):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(OUT / (ancestor+'.glb')))
    imported=set(bpy.data.objects)-before
    for o in imported:o.name=name+'_'+o.name.split('.')[0]
    root=empty(name)
    for o in imported:
        if o.parent not in imported:o.parent=root
    def pivot(suffix):return next(o for o in root.children_recursive if o.name.split('.')[0].endswith(suffix))
    body,head,tail=pivot('BodyPivot'),pivot('HeadPivot'),pivot('TailPivot')
    accent=material(name+'_Accent',[(.67,.30,.13),(.68,.63,.43),(.18,.64,.62),(.80,.60,.29),(.91,.60,.16),(.40,.91,.69)][index],.4)
    pale=material(name+'_Pale',(.82,.90,.65))
    if name=='riftstalker':
        body.scale.y*=1.2
        for side in [-1,1]:
            for i in range(5):
                z=.32-i*.24
                tube('SplitMane',[(side*.18,.30,z),(side*.40,.74,z-.10),(side*.53,.96,z-.2)],[.11,.08,.001],accent,body,6)
        tail.scale.y*=1.4
    elif name=='stonehorn':
        body.scale.x*=1.15
        sphere('CrownPlate',(0,.25,.31),(.65,.17,.46),accent,head)
        for side in [-1,1]:tube('CrownHorn',[(side*.4,.28,.25),(side*.62,.42,.70),(side*.56,.52,1.0)],[.20,.12,.005],pale,head)
        for i in range(4):sphere('DorsalSlab',(0,.33,.4-i*.3),(.56,.16,.13),accent,body)
    elif name=='tideblade':
        body.scale.y*=1.14
        for side in [-1,1]:
            for i in range(3):tube('GillBlade',[(side*.22,.15,.18-i*.18),(side*.57,.34,.10-i*.2),(side*.8,.60,-.1-i*.2)],[.075,.055,.003],accent,head,6)
            tube('ScytheTail',[(0,0,-.35),(side*.35,.22,-.8),(side*.6,.58,-1.1)],[.13,.09,.002],accent,tail,7)
    elif name=='spearbeak':
        for side in [-1,1]:
            tube('LeafCrest',[(side*.1,.2,-.1),(side*.28,.61,-.26),(side*.19,.9,-.5)],[.11,.10,.001],accent,head,6)
        tube('SpearBeak',[(0,-.03,.4),(0,-.03,.8),(0,-.07,1.1)],[.10,.07,.001],pale,head,7)
    elif name=='resinshell':
        sphere('ResinCarapace',(0,.24,0),(.68,.35,.8),accent,body)
        for i in range(7):
            a=i*math.tau/7;sphere('AmberPearl',(math.cos(a)*.48,.42,math.sin(a)*.58),(.10,.12,.10),pale,body)
    else:
        for side in [-1,1]:
            wing=next(o for o in root.children_recursive if o.name.split('.')[0].endswith('Wing_'+('L' if side<0 else 'R')))
            wing.scale*=1.35
            sphere('WingEye',(side*.3,.02,-.15),(.19,.035,.25),accent,wing)
        sphere('Lantern',(0,-.1,-.35),(.22,.22,.65),accent,body)
        bsdf=accent.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Emission Color'].default_value=(.28,.85,.53,1);bsdf.inputs['Emission Strength'].default_value=.6
    export(root,name+'.glb')
    root.location=Vector(((index%3-1)*4.8,(index//3)*4.5,0));roots.append(root)

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'zhongxi-expedition-descendants.blend'))
(SOURCE/'expedition-asset-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.data.materials.append(material('Studio_ground',(.08,.14,.12)))
for loc in [(4,-6,9),(-6,2,8),(4,8,10)]:
    bpy.ops.object.light_add(type='AREA',location=loc);lamp=bpy.context.object;lamp.data.energy=1500;lamp.data.size=6
    lamp.rotation_euler=(Vector((0,2,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(10,-16,14));camera=bpy.context.object;camera.rotation_euler=(Vector((0,2,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=17
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.filepath=str(SOURCE/'expedition-descendants-preview.png');bpy.ops.render.render(write_still=True)
print('EXPEDITION_ASSETS_COMPLETE',json.dumps(manifest))
