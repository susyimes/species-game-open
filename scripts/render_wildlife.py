"""Render all six generated species together without changing the source .blend."""
import bpy
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'art/zhongxi-creatures-and-habitat.blend'))
for obj in bpy.data.objects:obj.hide_render=True
for name,x,lift in [('Mossback',-7.5,0),('Reedbeak',-4.5,0),('Emberfang',-1.5,0),('Glowbug',1.5,1.1),('Tideback',4.5,0),('Reefjaw',7.5,0)]:
    obj=bpy.data.objects[name];obj.location=(x,0,lift);obj.hide_render=False
    for child in obj.children_recursive:child.hide_render=False
    bpy.ops.object.text_add(location=(x-.85,-1.75,.012))
    label=bpy.context.object;label.data.body=name.upper();label.data.size=.21;label.rotation_euler=(0,0,0)
    labelmat=bpy.data.materials.new(name+'Label');labelmat.diffuse_color=(.34,.41,.30,1);label.data.materials.append(labelmat)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.03));ground=bpy.context.object
mat=bpy.data.materials.new('Backdrop');mat.diffuse_color=(.57,.64,.49,1);ground.data.materials.append(mat)
scene=bpy.context.scene;scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.55,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
for pos,energy,size in [((2,-5,10),1700,7),((-6,-1,5),1000,5),((2,6,7),1500,5)]:
    bpy.ops.object.light_add(type='AREA',location=pos);lamp=bpy.context.object;lamp.data.energy=energy;lamp.data.shape='DISK';lamp.data.size=size
    lamp.rotation_euler=(Vector((0,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-14,8));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.9))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=20;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=2000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.filepath=str(root/'art/wildlife-lineup.png');scene.render.image_settings.file_format='PNG'
bpy.ops.render.render(write_still=True)
