"""Build original, editable game assets. Run with Blender --background --python this_file.

All coordinates in helpers use the game's X-right, Y-up, Z-forward convention.
No downloaded models or textures. Art is generated once, not during gameplay.
"""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'public' / 'models'
SOURCE = BASE / 'art'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(41)

def xyz(p): return (p[0], -p[2], p[1])

def material(name, color, roughness=.66, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    return m

skin = material('Skin_Jade', (.13, .49, .38))
belly = material('Belly_Pistachio', (.65, .78, .39))
dark = material('Markings_Petrol', (.06, .23, .22))
eye = material('Eyes_Obsidian', (.012, .027, .025), .15)
white = material('Eye_Glint', (.92, 1, .88), .15)
coral = material('Fin_Coral', (.96, .40, .27))
gold = material('Pollen_Gold', (.98, .70, .20))
bone = material('Ivory', (.86, .83, .61))
bark = material('Wood', (.29, .19, .11))
leaf = material('Leaf', (.24, .43, .14))
fruit = material('Fruit', (.95, .34, .13), .38)
rock = material('River_Stone', (.43, .49, .45))
crystal = material('Memory_Amber', (.39, .71, .62), .22, .22)
grass = material('Nest_Moss', (.46, .58, .20))

def empty(name, pos=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = xyz(pos)
    return o

def sphere(name, pos, scale, mat, parent=None, seg=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1)
    o = bpy.context.object
    o.name = name
    o.parent = parent
    o.location = xyz(pos)
    o.scale = (scale[0], scale[2], scale[1])
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def tube(name, points, radii, mat, parent=None, sides=8):
    # Continuous tapered tube along a spine, instead of intersecting cylinders.
    pts = [Vector(xyz(p)) for p in points]
    verts, faces = [], []
    for i,p in enumerate(pts):
        tangent = (pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        ref = Vector((1,0,0)) if abs(tangent.x) < .9 else Vector((0,1,0))
        u = tangent.cross(ref).normalized()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            a = j * math.tau / sides
            verts.append(p + radii[i]*(math.cos(a)*u+math.sin(a)*v))
    for i in range(len(pts)-1):
        for j in range(sides):
            a = i*sides+j; b = i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces += [tuple(reversed(range(sides))), tuple((len(pts)-1)*sides+j for j in range(sides))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(mat)
    for p in mesh.polygons: p.use_smooth=True
    return o

def fused(name, shapes, mat, parent):
    pieces = [sphere(name+'_volume',p,s,mat,parent,24,16) for p,s in shapes]
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces: o.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=name
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=obj.modifiers.new('Organic_surface','REMESH'); mod.mode='VOXEL'; mod.voxel_size=.055; mod.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth=obj.modifiers.new('Relax_surface','SMOOTH'); smooth.factor=1.15; smooth.iterations=5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    dec=obj.modifiers.new('Game_topology','DECIMATE'); dec.ratio=.4
    bpy.ops.object.modifier_apply(modifier=dec.name)
    return obj

def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in root.children_recursive: o.select_set(True)
    bpy.context.view_layer.objects.active=root

manifest={}
def export(root, filename):
    select_tree(root)
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
    manifest[filename]={'meshes':sum(o.type=='MESH' for o in root.children_recursive),'vertices':sum(len(o.data.vertices) for o in root.children_recursive if o.type=='MESH')}

hero=empty('Creature')
body=empty('BodyPivot',(0,.83,0),hero)
fused('Body', [((0,.04,-.23),(.53,.43,.66)),((0,.12,.22),(.50,.46,.53)),((0,.13,-.58),(.42,.36,.40))],skin,body)
sphere('Belly',(0,-.20,.18),(.43,.23,.58),belly,body)
head=empty('HeadPivot',(0,.35,.54),body)
fused('Head', [((0,.05,.14),(.52,.37,.47)),((0,-.05,.43),(.44,.22,.35))],skin,head)
sphere('Jaw',(0,-.16,.41),(.38,.085,.28),belly,head)
for side in [-1,1]:
    sphere('Cheek',(.39*side,-.01,.29),(.10,.12,.17),belly,head)
    sphere('EyeSocket',(.405*side,.155,.37),(.17,.20,.20),belly,head)
    sphere('Eye',(.445*side,.18,.47),(.115,.14,.105),eye,head)
    sphere('Glint',(.451*side,.226,.556),(.033,.039,.020),white,head,12,8)
    sphere('Nostril',(.145*side,.05,.734),(.024,.026,.017),dark,head,12,8)
    tube('Ear',[(.39*side,.26,0),(.61*side,.40,-.10),(.76*side,.64,-.22)],[.16,.13,.015],skin,head)
    sphere('EarAccent',(.59*side,.43,-.12),(.073,.15,.05),coral,head)
    tube('Antenna',[(.23*side,.32,.1),(.29*side,.62,.01),(.36*side,.72,.05)],[.035,.025,.02],dark,head)
    sphere('AntennaTip',(.36*side,.72,.05),(.07,.065,.07),gold,head)
for label,x,z in [('FL',-.40,.45),('FR',.40,.45),('BL',-.38,-.55),('BR',.38,-.55)]:
    leg=empty('Leg_'+label,(x,-.03,z),body)
    tube('Thigh_'+label,[(0,0,0),(x*.13,-.16,0),(x*.20,-.30,0)],[.16,.14,.115],skin,leg,10)
    knee=empty('Knee_'+label,(x*.20,-.30,0),leg)
    sphere('Joint_'+label,(0,0,0),(.12,.12,.12),skin,knee,12,8)
    tube('Shin_'+label,[(0,0,0),(0,-.16,.015),(0,-.29,.03)],[.115,.095,.075],skin,knee,10)
    sphere('Foot_'+label,(0,-.31,.12),(.17,.115,.25),skin,knee)
    for j in [-1,0,1]: sphere('Toe',(j*.075,-.335,.305),(.037,.039,.07),bone,knee,10,6)
tail=empty('TailPivot',(0,.05,-.70),body)
tube('Tail',[(0,0,0),(0,-.03,-.37),(0,.08,-.78),(0,.30,-1.1),(0,.43,-1.23)],[.26,.20,.12,.055,.008],skin,tail,12)
for i in range(5):
    sphere('BackSpot',(0,.50-i*.015,.15-i*.19),(.14-i*.015,.035,.085),dark,body)
shell=empty('Part_shell',(0,0,0),body)
sphere('Carapace',(0,.31,-.18),(.58,.31,.73),dark,shell,24,12)
for z in [-.55,-.27,0,.24]:
    tube('CarapaceRidge',[(-.45,.41,z),(0,.635,z),(.45,.41,z)],[.035,.035,.035],belly,shell)
horns=empty('Part_horns',(0,0,0),head)
for side in [-1,1]: tube('Horn',[(side*.25,.30,.19),(side*.29,.53,.30),(side*.25,.86,.40)],[.11,.075,.005],bone,horns,10)
fins=empty('Part_fins',(0,0,0),body)
for side in [-1,1]:
    for z in [-.35,.1]:
        tube('Fin',[(side*.40,.20,z),(side*.78,.24,z-.15),(side*.89,.49,z-.31)],[.15,.12,.005],coral,fins)
crest=empty('Part_crest',(0,0,0),head)
for i in range(4): tube('Crest',[(0,.33,.28-i*.15),(0,.75-i*.05,.17-i*.15)],[.115,.008],coral,crest)

# Specialisations are independent attachment nodes. Opposite branches are never shown together.
branch_mats={'venom':material('Venom_Violet',(.39,.23,.53)), 'bud':material('Bud_Teal',(.39,.69,.44))}
for branch in ['sprinter','bulwark','thorns','brood']:
    part=empty('Part_'+branch,parent=body)
    if branch=='sprinter':
        for side in [-1,1]:tube('Streamlining',[(side*.4,.15,-.5),(side*.63,.3,-.85),(side*.75,.55,-1.13)],[.13,.1,.008],coral,part)
    if branch=='bulwark':
        for z in [-.58,-.19,.20]:sphere('Plate',(0,.38,z),(.66,.30,.32),dark,part)
        for side in [-1,1]:sphere('SidePlate',(side*.46,.04,-.1),(.23,.28,.64),dark,part)
    if branch=='thorns':
        for side in [-1,1]:
            for z in [-.6,-.2,.2]:tube('DefensiveSpine',[(side*.38,.38,z),(side*.67,.74,z-.14)],[.09,.002],bone,part)
    if branch=='brood':
        for i in range(7):
            a=(i/6-.5)*2.7;sphere('BroodPetal',(math.sin(a)*.50,.62+math.cos(a)*.12,.15),(.14,.31,.055),gold,part)
for label in ['FL','FR']:
    part=empty('Part_digger_'+label,parent=bpy.data.objects['Knee_'+label])
    for x in [-.13,0,.13]:tube('DiggingClaw',[(x,-.31,.22),(x,-.39,.43),(x,-.37,.66)],[.07,.05,.005],bone,part)
for branch in ['fangs','venom','gills','sifter','antennae']:
    part=empty('Part_'+branch,parent=head)
    if branch=='fangs':
        for side in [-1,1]:tube('Fang',[(side*.23,-.10,.52),(side*.23,-.35,.62),(side*.20,-.41,.72)],[.08,.045,.003],bone,part)
    if branch=='venom':
        for side in [-1,1]:sphere('VenomSac',(side*.51,-.02,.02),(.19,.20,.25),branch_mats['venom'],part)
    if branch=='gills':
        for side in [-1,1]:
            for i in range(4):tube('Gill',[(side*.43,.06,-.09-i*.08),(side*(.76+i*.025),.32-i*.1,-.28-i*.09)],[.07,.006],coral,part)
    if branch=='sifter':
        sphere('SiftingMuzzle',(0,-.08,.75),(.34,.14,.49),belly,part)
        for side in [-1,1]:tube('MuzzleWhisker',[(side*.30,-.07,.77),(side*.59,-.1,.94)],[.02,.004],dark,part)
    if branch=='antennae':
        for side in [-1,1]:
            tube('SignalAntler',[(side*.28,.35,0),(side*.4,.85,-.07),(side*.55,1.12,.04)],[.05,.036,.01],dark,part)
            sphere('SignalTip',(side*.55,1.12,.04),(.09,.09,.09),gold,part)
            tube('SignalFork',[(side*.4,.82,-.05),(side*.74,.96,-.18)],[.029,.003],dark,part)
part=empty('Part_reservoir',parent=tail)
for z,r in [(-.35,.33),(-.73,.26)]:sphere('FatTail',(0,.03,z),(r,r*.75,r*1.2),gold,part)
part=empty('Part_regrowth',parent=tail)
for side in [-1,1]:
    sphere('HealingLeaf',(side*.16,.43,-1.14),(.16,.10,.40),branch_mats['bud'],part)
sphere('HealingBud',(0,.62,-1.24),(.12,.17,.12),coral,part)
export(hero,'sprig.glb')

# Four species with distinct silhouettes and rigs, rather than recolours of the player.
def species_eyes(parent, width, y, z, iris_mat=eye):
    for side in [-1,1]:
        sphere('SpeciesEye',(side*width,y,z),(.066,.075,.06),iris_mat,parent,12,8)
        sphere('SpeciesEyeGlint',(side*width+.015,y+.025,z+.048),(.017,.018,.014),white,parent,8,6)

def species_leg(prefix,label,parent,pos,upper,lower,mat,foot_mat,width=.10):
    leg=empty(prefix+'_Leg_'+label,pos,parent)
    tube('UpperLeg',[(0,0,0),(0,-upper,0)],[width*1.1,width*.85],mat,leg,8)
    knee=empty(prefix+'_Knee_'+label,(0,-upper,0),leg)
    sphere('KneeJoint',(0,0,0),(width,width,width),mat,knee,10,8)
    tube('LowerLeg',[(0,0,0),(0,-lower,0)],[width*.8,width*.65],mat,knee,8)
    sphere('SpeciesFoot',(0,-lower,.07),(width*1.6,.07,width*2),foot_mat,knee,12,8)
    return leg

moss_skin=material('Mossback_Skin',(.37,.43,.17));moss_shell=material('Mossback_Shell',(.20,.30,.12));moss_light=material('Mossback_Lichen',(.66,.64,.25))
moss=empty('Mossback');mb=empty('Mossback_BodyPivot',(0,.55,0),moss)
fused('MossbackTorso',[((0,0,0),(.67,.35,.87)),((0,.06,-.26),(.64,.38,.64))],moss_skin,mb)
sphere('DomedCarapace',(0,.26,-.12),(.75,.49,.91),moss_shell,mb,24,14)
for x,z in [(-.35,-.44),(.32,-.37),(0,.07),(-.36,.28),(.39,.3)]:sphere('LichenPlate',(x,.59,z),(.24,.10,.30),moss_light,mb,12,8)
mh=empty('Mossback_HeadPivot',(0,-.03,.76),mb)
sphere('MossbackHead',(0,0,.11),(.27,.23,.34),moss_skin,mh);species_eyes(mh,.22,.07,.28)
for i in [-1,1]:sphere('MossbackNostril',(i*.07,-.02,.44),(.022,.02,.02),dark,mh,8,6)
mt=empty('Mossback_TailPivot',(0,-.04,-.82),mb);tube('ShortTail',[(0,0,0),(0,.05,-.38)],[.12,.005],moss_skin,mt)
for label,x,z in [('FL',-.55,.5),('FR',.55,.5),('BL',-.51,-.5),('BR',.51,-.5)]:species_leg('Mossback',label,mb,(x,-.08,z),.18,.20,moss_skin,moss_skin,.14)
export(moss,'mossback.glb')

bird_skin=material('Reedbeak_Feather',(.36,.64,.64));bird_wing=material('Reedbeak_Wing',(.10,.37,.41));bird_bill=material('Reedbeak_Bill',(.86,.54,.21))
bird=empty('Reedbeak');bb=empty('Reedbeak_BodyPivot',(0,1.2,0),bird)
sphere('BirdBody',(0,0,-.1),(.33,.42,.53),bird_skin,bb)
tube('LongNeck',[(0,.14,.25),(0,.43,.33),(0,.68,.48)],[.16,.12,.14],bird_skin,bb,12)
bh=empty('Reedbeak_HeadPivot',(0,.67,.48),bb);sphere('BirdHead',(0,.01,.08),(.22,.22,.25),bird_skin,bh)
tube('LongBill',[(0,-.02,.25),(0,-.035,.64),(0,-.05,1.05)],[.115,.077,.005],bird_bill,bh,8);species_eyes(bh,.19,.065,.2)
for side,name in [(-1,'L'),(1,'R')]:
    wing=empty('Reedbeak_Wing_'+name,(side*.28,.14,-.12),bb)
    sphere('FoldedWing',(side*.04,-.12,-.11),(.12,.34,.50),bird_wing,wing)
bt=empty('Reedbeak_TailPivot',(0,.04,-.52),bb)
for i in [-1,0,1]:tube('TailFeather',[(i*.08,0,0),(i*.16,.18,-.48)],[.09,.004],bird_wing,bt)
for label,x in [('BL',-.2),('BR',.2)]:species_leg('Reedbeak',label,bb,(x,-.17,.06),.46,.48,bird_bill,bird_bill,.055)
export(bird,'reedbeak.glb')

pred_skin=material('Emberfang_Skin',(.42,.19,.12));pred_mane=material('Emberfang_Mane',(.89,.29,.10));pred_belly=material('Emberfang_Belly',(.69,.46,.27))
pred=empty('Emberfang');pb=empty('Emberfang_BodyPivot',(0,.93,0),pred)
fused('LeanPredator',[((0,0,-.23),(.42,.34,1.0)),((0,.1,.55),(.49,.42,.5))],pred_skin,pb)
sphere('PredatorChest',(0,-.15,.46),(.40,.31,.55),pred_belly,pb)
ph=empty('Emberfang_HeadPivot',(0,.22,.9),pb)
fused('PredatorHead',[((0,0,.05),(.32,.27,.44)),((0,-.04,.37),(.23,.16,.38))],pred_skin,ph)
sphere('PredatorJaw',(0,-.19,.36),(.22,.09,.36),pred_belly,ph);species_eyes(ph,.26,.055,.30)
for side in [-1,1]:
    tube('PredatorEar',[(side*.24,.15,-.1),(side*.32,.51,-.17)],[.115,.002],pred_skin,ph)
    for z in [.29,.48]:tube('PredatorFang',[(side*.16,-.10,z),(side*.15,-.34,z+.06)],[.055,.003],bone,ph)
for z,h in [(.57,.65),(.22,.75),(-.13,.70),(-.48,.59),(-.83,.45)]:tube('EmberMane',[(0,.27,z),(0,h,z-.18)],[.16,.004],pred_mane,pb)
pt=empty('Emberfang_TailPivot',(0,.05,-1.06),pb);tube('PredatorTail',[(0,0,0),(.10,.12,-.45),(.26,.20,-1),(.30,.49,-1.4)],[.15,.12,.07,.009],pred_skin,pt,10)
for label,x,z in [('FL',-.39,.64),('FR',.39,.64),('BL',-.35,-.66),('BR',.35,-.66)]:species_leg('Emberfang',label,pb,(x,-.14,z),.34,.34,pred_skin,dark,.115)
export(pred,'emberfang.glb')

bug_skin=material('Glowbug_Chitin',(.25,.28,.13));bug_wing=material('Glowbug_Wings',(.77,.78,.43),.4);bug_glow=material('Glowbug_Lantern',(.69,.83,.27),.35)
bug_glow.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.50,.70,.15,1)
bug_glow.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.7
bug=empty('Glowbug');gb=empty('Glowbug_BodyPivot',(0,.48,0),bug)
sphere('InsectThorax',(0,0,.19),(.24,.22,.36),bug_skin,gb)
sphere('LanternAbdomen',(0,-.04,-.43),(.40,.31,.54),bug_glow,gb,20,12)
for z in [-.64,-.38,-.13]:tube('AbdomenBand',[(-.3,.10,z),(0,.29,z),(.3,.10,z)],[.025,.025,.025],bug_skin,gb)
gh=empty('Glowbug_HeadPivot',(0,.04,.49),gb);sphere('InsectHead',(0,0,.07),(.26,.22,.26),bug_skin,gh);species_eyes(gh,.2,.05,.23)
for side in [-1,1]:tube('Feeler',[(side*.11,.16,.2),(side*.22,.43,.49),(side*.30,.37,.62)],[.025,.02,.004],bug_skin,gh)
for side,name in [(-1,'L'),(1,'R')]:
    wing=empty('Glowbug_Wing_'+name,(side*.16,.13,.06),gb)
    for z in [-.28,.28]:sphere('FlightMembrane',(side*.47,0,z),(.64,.035,.26),bug_wing,wing,16,8)
gt=empty('Glowbug_TailPivot',(0,0,-.87),gb);sphere('LanternTip',(0,0,-.03),(.17,.20,.18),bug_glow,gt)
for label,x,z in [('FL',-.2,.3),('FR',.2,.3),('BL',-.2,-.2),('BR',.2,-.2)]:species_leg('Glowbug',label,gb,(x,-.10,z),.12,.12,bug_skin,bug_skin,.025)
export(bug,'glowbug.glb')

# Add small, readable anatomical details to the resident species.
for side in [-1,1]:
    for z in [-.42,-.05,.31]:
        tube('MossbackShellSeam',[(side*.12,.71,z),(side*.44,.60,z+.10),(side*.61,.43,z+.17)],[.018,.016,.006],moss_shell,mb,6)
    for z in [-.25,.13]:
        tube('MossSprout',[(side*.36,.66,z),(side*.39,.88,z)],[.016,.006],leaf,mb,6)
        sphere('MossSproutLeaf',(side*.41,.86,z),(.09,.035,.04),moss_light,mb,8,6)
    for z in [-.4,-.12,.17]:
        sphere('PredatorSpot',(side*.405,.17,z),(.025,.07,.12),pred_belly,pb,8,6)
    for label in (['BL'] if side<0 else ['BR']):
        knee=bpy.data.objects['Reedbeak_Knee_'+label]
        for toe in [-1,0,1]:tube('ReedbeakToe',[(0,-.47,.03),(toe*.10,-.49,.29)],[.027,.008],bird_bill,knee,6)
    wing=bpy.data.objects['Glowbug_Wing_'+('L' if side<0 else 'R')]
    for z in [-.28,.28]:
        tube('WingVein',[(0,.025,z),(side*.42,.03,z+.04),(side*.90,.02,z)],[.012,.009,.002],bug_skin,wing,6)
for root,name in [(moss,'mossback'),(bird,'reedbeak'),(pred,'emberfang'),(bug,'glowbug')]:export(root,name+'.glb')

# Original amphibious visitors: broad paddle-tailed grazer and low armored hunter.
tide_skin=material('Tideback_Skin',(.11,.39,.43),.38)
tide_pattern=material('Tideback_TideMarks',(.34,.69,.63),.48)
tide_belly=material('Tideback_Belly',(.72,.77,.49),.62)
tide_gill=material('Tideback_Gills',(.88,.47,.36),.52)
tideback=empty('Tideback');tb=empty('Tideback_BodyPivot',(0,.56,0),tideback)
fused('TidebackTorso',[((0,0,-.12),(.62,.28,.85)),((0,-.02,.47),(.55,.26,.49))],tide_skin,tb)
sphere('TidebackUnderbelly',(0,-.13,.07),(.53,.17,.77),tide_belly,tb,20,12)
th=empty('Tideback_HeadPivot',(0,.015,.74),tb)
sphere('BroadHead',(0,0,.19),(.54,.23,.48),tide_skin,th,24,14);species_eyes(th,.43,.12,.36)
for side in [-1,1]:
    sphere('TidebackNostril',(side*.16,.03,.62),(.027,.018,.025),dark,th,8,6)
    for j in range(3):tube('GillFrill',[(side*.43,.02,-j*.1),(side*(.72-j*.05),.15,-.10-j*.12),(side*(.76-j*.04),.27,-.19-j*.1)],[.035,.027,.004],tide_gill,th,8)
    for j,z in enumerate([-.52,-.21,.11,.39]):sphere('TideMark',(side*(.3+.05*(j%2)),.255,z),(.13,.018,.11),tide_pattern,tb,12,8)
tt=empty('Tideback_TailPivot',(0,-.02,-.78),tb)
tube('PaddleSpine',[(0,0,0),(0,.03,-.55),(0,.02,-1.18)],[.22,.17,.02],tide_skin,tt,12)
sphere('TailPaddle',(0,.02,-.65),(.48,.055,.64),tide_pattern,tt,20,10)
for label,x,z in [('FL',-.5,.43),('FR',.5,.43),('BL',-.48,-.49),('BR',.48,-.49)]:
    species_leg('Tideback',label,tb,(x,-.1,z),.20,.22,tide_skin,tide_pattern,.115)
    knee=bpy.data.objects['Tideback_Knee_'+label]
    for toe in [-1,0,1]:tube('WebbedToe',[(0,-.21,.10),(toe*.09,-.23,.30)],[.034,.006],tide_pattern,knee,6)
export(tideback,'tideback.glb')

reef_skin=material('Reefjaw_Skin',(.37,.38,.30),.55)
reef_armor=material('Reefjaw_Armor',(.25,.29,.30),.58)
reef_edge=material('Reefjaw_ScaleEdge',(.72,.60,.35),.52)
reef_belly=material('Reefjaw_Belly',(.66,.66,.46),.7)
reefjaw=empty('Reefjaw');rb=empty('Reefjaw_BodyPivot',(0,.68,0),reefjaw)
fused('ReefjawTorso',[((0,0,-.15),(.40,.27,.95)),((0,.01,.47),(.49,.31,.48))],reef_skin,rb)
sphere('ReefjawUnderbelly',(0,-.17,0),(.34,.13,.87),reef_belly,rb,18,10)
rh=empty('Reefjaw_HeadPivot',(0,.05,.9),rb)
fused('ReefjawLongHead',[((0,0,.08),(.33,.20,.37)),((0,-.02,.44),(.25,.13,.46))],reef_skin,rh)
sphere('ReefjawLowerJaw',(0,-.14,.39),(.25,.045,.40),reef_belly,rh,18,10);species_eyes(rh,.285,.09,.23)
for side in [-1,1]:
    tube('ReefjawBrow',[(side*.23,.18,.11),(side*.31,.18,.31)],[.065,.025],reef_armor,rh,8)
    for z in [.37,.54,.69]:tube('ReefjawTooth',[(side*.21,-.045,z),(side*.20,-.18,z+.03)],[.025,.002],bone,rh,6)
for j,z in enumerate([-.66,-.39,-.12,.15,.42]):
    for side in [-1,0,1]:
        scale=sphere('ReefScale',(side*.24,.255-(abs(side)*.055),z),(.19,.085,.21),reef_armor,rb,10,6)
        tube('ScaleRidge',[(side*.24,.30,z+.08),(side*.24,.36,z-.09)],[.035,.008],reef_edge,rb,6)
rt=empty('Reefjaw_TailPivot',(0,-.01,-.98),rb)
tube('SwimmingTail',[(0,0,0),(0,.05,-.53),(.05,.04,-1.09),(.13,.02,-1.62)],[.19,.16,.08,.008],reef_skin,rt,12)
for z in [-.3,-.6,-.9]:tube('TailScute',[(0,.07,z),(0,.29,z-.12)],[.10,.005],reef_edge,rt,8)
for label,x,z in [('FL',-.43,.48),('FR',.43,.48),('BL',-.37,-.57),('BR',.37,-.57)]:
    species_leg('Reefjaw',label,rb,(x,-.14,z),.24,.25,reef_skin,reef_armor,.10)
export(reefjaw,'reefjaw.glb')

# Habitat objects have their own roots so the game can instance them efficiently.
berry=empty('BerryBush')
for i in range(5):
    a=i*2.4; x=math.cos(a)*.48; z=math.sin(a)*.42
    tube('Branch',[(0,0,0),(x,.58,z)],[.07,.025],bark,berry)
    sphere('Leaves',(x,.60,z),(.44,.31,.42),leaf,berry)
    sphere('Berry',(x+.12,.84,z+.08),(.15,.17,.15),fruit,berry)
    sphere('Calyx',(x+.12,1.0,z+.08),(.075,.045,.07),leaf,berry)
export(berry,'berry.glb')

nest=empty('Nest')
for i in range(20):
    a=math.tau*i/20
    x,z=math.cos(a)*1.45,math.sin(a)*1.45
    o=sphere('WovenTwig',(x,.18+random.random()*.16,z),(.11,.12,.61),bark,nest)
    o.rotation_euler[2]=-a
for i in range(14):
    a=i*2.4
    sphere('Moss',(math.cos(a)*1.34,.28,math.sin(a)*1.34),(.38,.19,.35),grass,nest)
for i in range(3): sphere('Egg',((i-1)*.45,.33,.1 if i%2 else -.18),(.25,.34,.25),bone,nest)
export(nest,'nest.glb')

tree=empty('CanopyTree')
tube('Trunk',[(0,0,0),(.11,1.5,0),(-.14,2.6,.08),(0,3.3,0)],[.37,.27,.20,.10],bark,tree,10)
for i in range(7):
    a=i*2.4; r=1.15 if i else 0
    x,z=math.cos(a)*r,math.sin(a)*r
    tube('Bough',[(0,1.8,0),(x*.65,2.65,z*.65),(x,3.1,z)],[.13,.07,.02],bark,tree)
    sphere('Canopy',(x,3.25+random.random()*.65,z),(1.25,.73,1.20),leaf if i%3 else grass,tree,18,12)
export(tree,'tree.glb')

stone=empty('StoneDeposit')
for i in range(6):
    a=i*2.4
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
    o=bpy.context.object; o.name='Stone'; o.parent=stone
    o.location=xyz((math.cos(a)*.48,.25,math.sin(a)*.48))
    o.scale=(.50,.43,.36+random.random()*.28);o.data.materials.append(rock)
export(stone,'stone.glb')

relic=empty('AncientSpore')
for i in range(5):
    a=i*math.tau/5; x,z=math.cos(a)*.52,math.sin(a)*.52
    tube('Crystal',[(x,0,z),(x,.5+random.random()*.5,z),(x,1.2+random.random()*.5,z)],[.20,.20,.001],crystal,relic,5)
sphere('SporeCore',(0,.85,0),(.33,.38,.33),gold,relic)
export(relic,'relic.glb')

# Lay out the source as an asset library; the GLBs above remain centred at origin.
berry.location.x=4;nest.location.x=8;tree.location.x=-5;stone.location.x=4;stone.location.y=4;relic.location.x=8;relic.location.y=4
for i,o in enumerate([moss,bird,pred,bug,tideback,reefjaw]):o.location.x=(i-2.5)*4;o.location.y=7
optional_parts=[o for o in hero.children_recursive if o.name.startswith('Part_')]
for o in optional_parts: o.hide_render=True; o.hide_viewport=True
bpy.context.scene.world.color=(.18,.22,.22)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'zhongxi-creatures-and-habitat.blend'))

# A deliberately simple studio render makes silhouette, pivots and surfaces reviewable.
for o in [berry,nest,tree,stone,relic,moss,bird,pred,bug,tideback,reefjaw]:
    o.hide_render=True
    for c in o.children_recursive:c.hide_render=True
for p in optional_parts:
    for c in p.children_recursive:c.hide_render=True
bpy.ops.mesh.primitive_plane_add(size=200)
floor=bpy.context.object;floor.data.materials.append(material('Studio',(.065,.11,.10)))
floor.location.z=-.04
world=bpy.context.scene.world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.25,.23,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5
for loc,power,size in [((3,-4,7),900,5),((-4,-1,4),650,4),((1,5,5),1100,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
    lamp.rotation_euler=(Vector((0,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-6,3.1))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.9))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=4.6
scene=bpy.context.scene;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(SOURCE/'sprig-preview.png')
bpy.ops.render.render(write_still=True)
(SOURCE/'asset-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('ZHONGXI_ASSETS_COMPLETE',json.dumps(manifest))
