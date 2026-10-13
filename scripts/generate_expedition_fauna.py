"""Four original expedition creatures, with editable pivots and individual GLB exports."""
from pathlib import Path
import bpy
import math
import json
from mathutils import Vector

BASE=Path(__file__).resolve().parents[1]
exec((BASE/'scripts/generate_models.py').read_text(encoding='utf-8').split("hero=empty(")[0])
bpy.context.preferences.filepaths.save_version=0
base_export=export

def export(root,filename):
    # Unique semantic pivots survive GLTFLoader's punctuation sanitizing.
    for obj in root.children_recursive:
        if obj.type=='EMPTY':obj.name=root.name+'_'+obj.name.split('.')[0]
    base_export(root,filename)

def blade(name,points,mat,parent):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([xyz(p) for p in points],[],[tuple(range(len(points)))]);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.parent=parent;obj.data.materials.append(mat)
    solid=obj.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.035
    return obj

def frame(name,y,head_pos):
    root=empty(name);body=empty('BodyPivot',(0,y,0),root);head=empty('HeadPivot',head_pos,body);tail=empty('TailPivot',(0,0,-.52),body)
    return root,body,head,tail

def eyes(head,x,y,z,size=.10):
    for side in [-1,1]:
        sphere('Eye',(side*x,y,z),(size,size*1.15,size*.8),eye,head,12,8)
        sphere('Glint',(side*x+.015,y+.035,z+.055),(size*.27,size*.3,size*.19),white,head,10,6)

def legs(body,skin_mat,foot_mat,x,z,upper,lower):
    for name,side,fore in [('FL',-1,1),('FR',1,1),('BL',-1,-1),('BR',1,-1)]:
        hip=empty('Leg_'+name,(side*x,-.08,fore*z),body)
        tube('Upper_'+name,[(0,0,0),(side*.09,-upper*.6,0),(side*.07,-upper,.01)],[.10,.08,.07],skin_mat,hip,8)
        knee=empty('Knee_'+name,(side*.07,-upper,.01),hip)
        tube('Lower_'+name,[(0,0,0),(0,-lower,.12)],[.07,.055],skin_mat,knee,8)
        sphere('Foot_'+name,(0,-lower,.18),(.14,.065,.22),foot_mat,knee,12,8)

roots=[]
# Reed-crowned browser: a long neck, split muzzle and broad leaf fan.
fern=material('Fernback_Moss',(.34,.50,.23));fern_pale=material('Fernback_Cream',(.78,.80,.48));fern_leaf=material('Fernback_Reeds',(.32,.63,.40))
root,body,head,tail=frame('fernback',.82,(0,.32,.57))
sphere('Torso',(0,0,-.12),(.51,.36,.73),fern,body)
tube('Neck',[(0,.05,.32),(0,.4,.55),(0,.7,.66)],[.31,.22,.18],fern,body,10)
sphere('Head',(0,.34,.14),(.27,.24,.37),fern,head)
sphere('Muzzle',(0,.22,.42),(.25,.13,.22),fern_pale,head);eyes(head,.22,.43,.31,.09)
for i in range(5):
    x=(i-2)*.13;tip=(i-2)*.19
    blade('ReedCrown',[(x,.45,-.1),(tip-.15,.85,-.16),(tip,.95+(.15 if i==2 else 0),-.30),(tip+.12,.8,-.05)],fern_leaf,head)
for side in [-1,1]:
    for i in range(3):sphere('SideSpot',(side*.47,.05,.28-i*.3),(.04,.12,.12),fern_pale,body,10,6)
legs(body,fern,fern_pale,.34,.43,.32,.30)
tube('Tail',[(0,0,0),(0,.08,-.4),(.12,.18,-.7)],[.13,.08,.01],fern,tail,8)
export(root,'fernback.glb');roots.append(root)

# A floating ray, visibly different from the small fast-flapping insects.
ray=material('Moonray_Teal',(.15,.45,.51));ray_pale=material('Moonray_Pearl',(.59,.81,.78));ray_edge=material('Moonray_Moonlight',(.76,.86,.59))
bsdf=ray_edge.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Emission Color'].default_value=(.35,.64,.48,1);bsdf.inputs['Emission Strength'].default_value=.3
root,body,head,tail=frame('moonray',.7,(0,.02,.45))
sphere('Disc',(0,0,0),(.46,.18,.72),ray,body);sphere('Underside',(0,-.11,.07),(.39,.07,.58),ray_pale,body)
sphere('Head',(0,.01,.10),(.30,.16,.30),ray,head);eyes(head,.19,.13,.29,.08)
for side,label in [(-1,'L'),(1,'R')]:
    wing=empty('Wing_'+label,(side*.28,0,0),body)
    blade('BroadSail',[(0,.02,.5),(side*.75,.04,.62),(side*1.48,.09,-.06),(side*.88,.01,-.35),(0,0,-.55)],ray,wing)
    tube('SailRim',[(0,.03,.5),(side*.75,.07,.62),(side*1.48,.1,-.06),(side*.88,.04,-.35)],[.035,.035,.02,.01],ray_edge,wing,6)
    for i in range(3):sphere('SailPearl',(side*(.36+i*.23),.065,.14-i*.08),(.065,.026,.10),ray_edge,wing,10,6)
tube('RibbonTail',[(0,0,0),(.14,-.05,-.55),(-.12,.12,-1.05),(.08,.2,-1.5)],[.09,.06,.035,.004],ray_pale,tail,8)
export(root,'moonray.glb');roots.append(root)

# A territorial shore crab with animated independent claws.
crab=material('Mireclaw_Copper',(.68,.32,.16));crab_plate=material('Mireclaw_Shell',(.33,.43,.47));crab_pale=material('Mireclaw_Ivory',(.85,.71,.43))
root,body,head,tail=frame('mireclaw',.52,(0,.08,.4))
sphere('Carapace',(0,0,0),(.72,.29,.58),crab_plate,body);sphere('CarapaceEdge',(0,-.10,.04),(.77,.15,.61),crab,body)
sphere('Face',(0,0,.1),(.32,.16,.24),crab,head)
for side in [-1,1]:
    tube('Eyestalk',[(side*.21,.04,.13),(side*.26,.31,.2)],[.055,.045],crab_pale,head,6)
eyes(head,.26,.34,.23,.075)
legs(body,crab,crab_pale,.62,.29,.18,.22)
for side,label in [(-1,'L'),(1,'R')]:
    claw=empty('Claw_'+label,(side*.56,.08,.40),body)
    tube('Arm',[(0,0,0),(side*.27,.05,.22),(side*.26,.10,.57)],[.11,.09,.12],crab,claw,8)
    sphere('Palm',(side*.26,.11,.69),(.19 if side<0 else .25,.16,.28),crab,claw)
    for jaw in [-1,1]:tube('Pincer',[(side*.26+jaw*.09,.12,.78),(side*.26+jaw*.17,.15,1.0),(side*.26+jaw*.04,.16,1.13)],[.1,.07,.004],crab_pale,claw,8)
for i in range(3):sphere('ShellRidge',(0,.25,.25-i*.24),(.48,.09,.065),crab_pale,body,12,8)
export(root,'mireclaw.glb');roots.append(root)

# A low rolling armoured predator with a segmented shell and thorn silhouette.
armour=material('Spinedillo_Mauve',(.41,.30,.38));armour_pale=material('Spinedillo_Sand',(.71,.62,.45));armour_dark=material('Spinedillo_Slates',(.24,.26,.33))
root,body,head,tail=frame('spinedillo',.59,(0,.04,.53))
sphere('Body',(0,0,-.12),(.56,.35,.75),armour,body)
sphere('Head',(0,0,.2),(.30,.22,.32),armour_dark,head);sphere('Snout',(0,-.05,.44),(.18,.12,.25),armour_pale,head);eyes(head,.24,.13,.25,.075)
for i in range(6):
    z=.47-i*.22;sphere('ArmourBand',(0,.17,z),(.58,.24,.12),armour_dark if i%2 else armour,body,14,8)
    for side in [-1,1]:tube('Spine',[(side*.26,.32,z),(side*.35,.63,z-.12),(side*.40,.75,z-.2)],[.10,.06,.001],armour_pale,body,6)
legs(body,armour,armour_pale,.42,.42,.20,.20)
tube('ClubTail',[(0,0,0),(0,.06,-.36),(0,.14,-.67)],[.19,.16,.075],armour,tail,8)
sphere('TailClub',(0,.14,-.67),(.19,.16,.21),armour_pale,tail,12,8)
export(root,'spinedillo.glb');roots.append(root)

labels=['FERNBACK','MOONRAY','MIRECLAW','SPINEDILLO']
for i,root in enumerate(roots):
    root.location=Vector(((i%2-.5)*5.4,(i//2)*4.7,0))
    bpy.ops.object.text_add(location=(root.location.x-1.35,root.location.y-2.1,.025));label=bpy.context.object;label.data.body=labels[i];label.data.size=.29;label.data.materials.append(ray_pale)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'zhongxi-expedition-fauna.blend'))
(SOURCE/'expedition-fauna-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.04));bpy.context.object.data.materials.append(material('Fauna_Backdrop',(.065,.12,.13)))
scene=bpy.context.scene;scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.5,.6,.55,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
for pos in [(1,-6,10),(-7,4,7),(6,8,9)]:
    bpy.ops.object.light_add(type='AREA',location=pos);lamp=bpy.context.object;lamp.data.energy=1100;lamp.data.size=6;lamp.rotation_euler=(Vector((0,2,.7))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-15,15));camera=bpy.context.object;camera.rotation_euler=(Vector((0,2,.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=14;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(SOURCE/'expedition-fauna-preview.png');bpy.ops.render.render(write_still=True)
print('EXPEDITION_FAUNA_COMPLETE',json.dumps(manifest))
