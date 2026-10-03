"""Builds every game model procedurally and exports each one to <out>/<name>.glb.

Run: npm run assets
 (= Blender -b --python tools/blender/build_assets.py -- public/models)

Conventions
- 1 Blender unit = 1 tile = 1 metre. Blender is Z-up; the glTF exporter converts to Y-up.
- The game's +Z (towards the front of the room) is Blender's -Y. So models "face" -Y.
- Room-space models (counter, kitchen) are built with T(x, z, h): game coordinates in.
- Wall pieces have their back on Blender y=0 and stick out towards -Y, centred on x=0.
- Material names matter: the game recolours "shirt", "pants", "skin", "hair", "hands", "beanie", "cap".
"""

import math
import os
import random
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/models"
os.makedirs(OUT, exist_ok=True)


# ----------------------------------------------------------------------------- helpers

def lin(hex_color):
    """sRGB hex → linear RGBA."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.7, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = lin(emit)
        b.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
        else:
            m.blend_method = "BLEND"
    return m


def _finish(o, name, material, parent, bevel, smooth):
    o.name = name
    if material:
        o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    if parent:
        parent_to(o, parent)
    return o


def parent_to(o, parent):
    """Parent while keeping the world transform, with an identity parent-inverse (clean glTF nodes)."""
    bpy.context.view_layer.update()
    world = o.matrix_world.copy()
    o.parent = parent
    o.matrix_parent_inverse.identity()
    o.matrix_world = world


def box(name, loc, size, material, parent=None, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, name, material, parent, bevel, False)


def cyl(name, loc, r, depth, material, parent=None, verts=16, rot=(0, 0, 0), smooth=True, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, name, material, parent, 0, smooth)


def ball(name, loc, r, material, parent=None, scale=(1, 1, 1), segs=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=max(6, segs // 2), radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, name, material, parent, 0, True)


def rod(name, a, b, r, material, parent=None, verts=8):
    """Cylinder between two points."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    mid = ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    rot_y = math.acos(max(-1, min(1, dz / length))) if length else 0
    rot_z = math.atan2(dy, dx)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=mid, rotation=(0, rot_y, rot_z))
    return _finish(bpy.context.active_object, name, material, parent, 0, True)


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if parent:
        o.parent = parent
    return o


def set_origin(o, point):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.context.scene.cursor.location = point
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def T(x, z, h=0.0):
    """Game/room coordinates (x right, z towards viewer, h up) → Blender location."""
    return (x, -z, h)


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print(f"[assets] wrote {path}")


# ----------------------------------------------------------------------------- shared materials

def M():
    return {
        "wood": mat("wood", "#7a5232", 0.8),
        "wood2": mat("wood_light", "#8f6640", 0.8),
        "wood3": mat("wood_dark", "#54361f", 0.85),
        "steel": mat("steel", "#8d9297", 0.55, 0.7),
        "darksteel": mat("dark_steel", "#3b3d40", 0.5, 0.8),
        "gunmetal": mat("gunmetal", "#4a4d52", 0.45, 0.75),
        "black": mat("matte_black", "#1a1a1a", 0.8),
        "brass": mat("brass", "#b08d57", 0.35, 0.9),
        "concrete": mat("concrete", "#9a9893", 0.9),
        "bulb": mat("bulb", "#ffe2a8", 0.3, 0, "#ffb347", 18.0),
        "cord": mat("cord", "#111111", 0.6),
        "chalk": mat("chalk", "#efeee6", 0.9, 0, "#efeee6", 0.15),
        "board": mat("chalkboard", "#1f2421", 0.95),
        "rust": mat("rusty_metal", "#8a4b22", 0.6, 0.6),
        "glass": mat("glass", "#9cc3dd", 0.05, 0, "#cfe6f5", 0.6, alpha=0.35),
        "bun": mat("bun", "#d9a05b", 0.6),
        "patty": mat("patty", "#5a3115", 0.8),
        "cheese": mat("cheese", "#f2b33d", 0.5),
        "lettuce": mat("lettuce", "#6aa84f", 0.6),
        "eggwhite": mat("egg_white", "#f7f3ea", 0.4),
        "yolk": mat("yolk", "#f5a623", 0.3),
        "fry": mat("fry", "#f2c14e", 0.6),
        "ketchup": mat("ketchup", "#b3221a", 0.3),
    }


def burger(m, parent, x=0.0, y=0.0, z=0.0, s=1.0, egg=True):
    """A stacked smash burger with optional fried egg and the obligatory toothpick."""
    def at(h):
        return (x, y, z + h * s)
    cyl("bun_bottom", at(0.015), 0.075 * s, 0.03 * s, m["bun"], parent, 20)
    cyl("patty", at(0.04), 0.082 * s, 0.022 * s, m["patty"], parent, 11, smooth=False)
    box("cheese", at(0.053), (0.13 * s, 0.13 * s, 0.006 * s), m["cheese"], parent, rot=(0, 0, 0.6))
    cyl("lettuce", at(0.062), 0.085 * s, 0.012 * s, m["lettuce"], parent, 9, smooth=False)
    if egg:
        cyl("egg", at(0.072), 0.08 * s, 0.008 * s, m["eggwhite"], parent, 10, smooth=False)
        ball("yolk", at(0.078), 0.026 * s, m["yolk"], parent, (1, 1, 0.55), 10)
    ball("bun_top", at(0.085 if egg else 0.07), 0.078 * s, m["bun"], parent, (1, 1, 0.6), 16)
    pick = rod("toothpick", at(0.06), at(0.2), 0.003 * s, m["wood2"], parent)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.012 * s, minor_radius=0.003 * s, location=at(0.21), rotation=(math.pi / 2, 0, 0))
    _finish(bpy.context.active_object, "toothpick_knot", m["wood2"], parent, 0, True)
    return pick


def fries_basket(m, parent, x=0.0, y=0.0, z=0.0, s=1.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.06 * s, depth=0.08 * s, location=(x, y, z + 0.04 * s))
    o = bpy.context.active_object
    wire = o.modifiers.new("wire", "WIREFRAME")
    wire.thickness = 0.004 * s
    _finish(o, "fry_basket", m["steel"], parent, 0, False)
    rnd = random.Random(7)
    for i in range(14):
        a = rnd.random() * math.tau
        r = rnd.random() * 0.04 * s
        h = (0.09 + rnd.random() * 0.04) * s
        tilt = (rnd.random() - 0.5) * 0.5
        box(f"fry{i}", (x + math.cos(a) * r, y + math.sin(a) * r, z + h / 2 + 0.01 * s), (0.012 * s, 0.012 * s, h), m["fry"], parent, rot=(tilt, tilt * 0.7, a))


# ----------------------------------------------------------------------------- furniture

def build_table():
    m = M()
    root = empty("table")
    for i, wm in enumerate([m["wood"], m["wood2"], m["wood"]]):
        box(f"plank{i}", (-0.3 + i * 0.3, 0, 0.755), (0.295, 0.9, 0.05), wm, root, 0.006)
    for sx in (-0.38, 0.38):
        for sy in (-0.38, 0.38):
            box("leg", (sx, sy, 0.365), (0.05, 0.05, 0.73), m["black"], root, 0.005)
    box("apron_x", (0, 0.38, 0.69), (0.76, 0.03, 0.06), m["black"], root)
    box("apron_x2", (0, -0.38, 0.69), (0.76, 0.03, 0.06), m["black"], root)
    export("table")


def build_stool():
    m = M()
    root = empty("stool")
    box("seat", (0, 0, 0.665), (0.36, 0.36, 0.03), m["gunmetal"], root, 0.01)
    box("seat_hole", (0, 0.05, 0.681), (0.08, 0.02, 0.002), m["black"], root)
    box("skirt", (0, 0, 0.635), (0.33, 0.33, 0.04), m["gunmetal"], root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod("leg", (sx * 0.15, sy * 0.15, 0.65), (sx * 0.2, sy * 0.2, 0.0), 0.016, m["gunmetal"], root, 6)
    for sx, sy, w, d in ((0, -1, 0.36, 0.015), (0, 1, 0.36, 0.015), (-1, 0, 0.015, 0.36), (1, 0, 0.015, 0.36)):
        box("ring", (sx * 0.18, sy * 0.18, 0.22), (w, d, 0.015), m["gunmetal"], root)
    export("stool")


def build_edison():
    m = M()
    root = empty("edison")
    box("beam", (0, 0, 2.6), (0.95, 0.14, 0.12), m["wood3"], root, 0.012)
    for x in (-0.38, 0.38):
        rod("chain", (x, 0, 2.66), (x, 0, 3.4), 0.006, m["cord"], root)
        box("bracket", (x, 0, 2.665), (0.05, 0.16, 0.01), m["black"], root)
    rnd = random.Random(3)
    for i in range(7):
        x = -0.4 + i * (0.8 / 6)
        y = (rnd.random() - 0.5) * 0.06
        drop = 0.18 + rnd.random() * 0.42
        bz = 2.54 - drop
        rod("cord", (x, y, 2.54), (x, y, bz + 0.05), 0.003, m["cord"], root, 6)
        cyl("socket", (x, y, bz + 0.035), 0.017, 0.05, m["brass"], root, 10)
        ball("bulb", (x, y, bz - 0.02), 0.04, m["bulb"], root, (1, 1, 1.45), 12)
    export("edison")


def build_strings():
    m = M()
    root = empty("strings")
    n = 14
    prev = None
    for i in range(n + 1):
        f = i / n
        x = -0.95 + f * 1.9
        z = 2.75 - math.sin(f * math.pi) * 0.28
        p = (x, 0, z)
        if prev:
            rod("wire", prev, p, 0.004, m["cord"], root, 5)
        if 0 < i < n:
            ball("bulb", (x, 0, z - 0.05), 0.028, m["bulb"], root, (1, 1, 1.2), 10)
            rod("drop", p, (x, 0, z - 0.03), 0.003, m["cord"], root, 5)
        prev = p
    for x in (-0.95, 0.95):
        rod("hanger", (x, 0, 2.75), (x, 0, 3.4), 0.004, m["cord"], root, 5)
    export("strings")


# ----------------------------------------------------------------------------- wall pieces

def build_chalk():
    m = M()
    root = empty("chalk")
    box("frame", (0, -0.025, 1.6), (0.8, 0.05, 1.05), m["wood3"], root, 0.008)
    box("board", (0, -0.052, 1.6), (0.7, 0.01, 0.95), m["board"], root)
    rnd = random.Random(11)
    box("title", (0, -0.06, 1.98), (0.36, 0.004, 0.05), m["chalk"], root)
    for row in range(10):
        z = 1.86 - row * 0.068
        x = -0.3
        while x < 0.28:
            length = 0.03 + rnd.random() * 0.1
            box("scribble", (x + length / 2, -0.06, z + (rnd.random() - 0.5) * 0.01), (length, 0.004, 0.012), m["chalk"], root, rot=(0, (rnd.random() - 0.5) * 0.15, 0))
            x += length + 0.03
        if rnd.random() < 0.6:
            box("price", (0.27, -0.06, z), (0.05, 0.004, 0.018), m["chalk"], root)
    # A doodled burger, because of course.
    for i, (w, h) in enumerate(((0.16, 0.02), (0.18, 0.014), (0.16, 0.03))):
        box(f"doodle{i}", (-0.18, -0.06, 1.17 + i * 0.03), (w, 0.004, h), m["chalk"], root)
    export("chalk")


LETTERS = {
    "E": ["111", "100", "110", "100", "111"],
    "A": ["010", "101", "111", "101", "101"],
    "T": ["111", "010", "010", "010", "010"],
}


def build_eat():
    m = M()
    root = empty("eat")
    pitch = 0.135
    col = 0
    cols_total = 11
    for ch in "EAT":
        for ri, row in enumerate(LETTERS[ch]):
            for ci, on in enumerate(row):
                if on != "1":
                    continue
                x = (col + ci - (cols_total - 1) / 2) * pitch
                z = 2.2 - ri * pitch
                box("letter", (x, -0.05, z), (pitch * 1.02, 0.1, pitch * 1.02), m["rust"], root, 0.01)
                cyl("socket", (x, -0.105, z), 0.022, 0.012, m["brass"], root, 10, rot=(math.pi / 2, 0, 0))
                ball("bulb", (x, -0.125, z), 0.026, m["bulb"], root, segs=10)
        col += 4
    export("eat")


def build_taps():
    m = M()
    root = empty("taps")
    for i in range(6):
        wm = [m["wood"], m["wood2"], m["wood3"]][i % 3]
        box(f"panel{i}", (0, -0.015, 1.12 + i * 0.12), (1.8, 0.03, 0.115), wm, root)
    cyl("tower", (0, -0.1, 1.42), 0.025, 1.7, m["steel"], root, 12, rot=(0, math.pi / 2, 0))
    rnd = random.Random(5)
    colors = ["#c0392b", "#2e86c1", "#f1c40f", "#27ae60", "#8e44ad", "#e67e22", "#ecf0f1", "#34495e"]
    for i in range(8):
        x = -0.72 + i * (1.44 / 7)
        rod("shank", (x, -0.1, 1.42), (x, -0.17, 1.42), 0.012, m["steel"], root)
        cyl("faucet", (x, -0.17, 1.38), 0.012, 0.08, m["steel"], root, 8)
        h = 0.14 + rnd.random() * 0.1
        box("handle", (x, -0.17, 1.46 + h / 2), (0.04, 0.04, h), mat(f"tap_handle_{i}", colors[i], 0.5), root, 0.006)
    box("shelf", (0, -0.12, 0.98), (1.7, 0.22, 0.03), m["wood3"], root)
    growler = mat("growler", "#3a2412", 0.15, 0, alpha=0.9)
    for i in range(6):
        x = -0.65 + i * 0.26
        cyl("growler", (x, -0.12, 1.08), 0.05, 0.16, growler, root, 14)
        cyl("growler_neck", (x, -0.12, 1.19), 0.022, 0.06, growler, root, 10)
    export("taps")


def build_garage():
    m = M()
    root = empty("garage")
    alu = mat("aluminum", "#8a8f94", 0.35, 0.85)
    w, h = 1.85, 2.5
    box("frame_top", (0, -0.04, h), (w + 0.1, 0.08, 0.08), alu, root)
    for x in (-w / 2, w / 2):
        box("frame_side", (x, -0.04, h / 2), (0.08, 0.08, h), alu, root)
    cols, rows = 4, 5
    for r in range(rows):
        z0 = 0.05 + r * (h - 0.05) / rows
        box("rail", (0, -0.05, z0), (w, 0.06, 0.05), alu, root)
        for c in range(cols):
            x = -w / 2 + (c + 0.5) * w / cols
            box("pane", (x, -0.045, z0 + (h - 0.05) / rows / 2), (w / cols - 0.05, 0.01, (h - 0.05) / rows - 0.05), m["glass"], root)
    for c in range(1, cols):
        box("mullion", (-w / 2 + c * w / cols, -0.05, h / 2), (0.035, 0.06, h), alu, root)
    box("handle", (0, -0.1, 0.3), (0.3, 0.03, 0.03), alu, root)
    export("garage")


# ----------------------------------------------------------------------------- counter + kitchen (room space)

def build_counter():
    m = M()
    root = empty("counter")
    length = 7.0
    box("body", T(length / 2, 2.5, 0.48), (length, 0.9, 0.96), m["wood3"], root)
    rnd = random.Random(2)
    woods = [m["wood"], m["wood2"], m["wood3"]]
    for i in range(6):
        x = 0
        while x < length - 0.01:
            pl = min(length - x, 0.8 + rnd.random() * 1.4)
            box("plank", T(x + pl / 2, 2.96, 0.08 + i * 0.16), (pl - 0.01, 0.03, 0.15), rnd.choice(woods), root, 0.004)
            x += pl
    box("top", T(length / 2, 2.5, 0.99), (length + 0.06, 1.08, 0.06), m["concrete"], root, 0.01)
    box("kick", T(length / 2, 2.98, 0.03), (length, 0.02, 0.06), m["black"], root)
    # POS tablet on a stand at the register tile (x = 3).
    cyl("pos_stand", T(3.5, 2.45, 1.08), 0.02, 0.12, m["steel"], root, 10)
    box("pos_tablet", T(3.5, 2.47, 1.2), (0.26, 0.015, 0.19), m["black"], root, 0.005, rot=(-0.5, 0, 0))
    box("pos_screen", T(3.5, 2.48, 1.2), (0.23, 0.01, 0.16), mat("screen", "#e8f4ff", 0.2, 0, "#e8f4ff", 2.0), root, rot=(-0.5, 0, 0))
    # Fries in wire baskets, ketchup, a tip jar and a toothpick cup.
    fries_basket(m, root, 4.7, -2.4, 1.02, 1.3)
    fries_basket(m, root, 5.0, -2.55, 1.02, 1.3)
    cyl("ketchup", T(1.2, 2.5, 1.1), 0.03, 0.16, m["ketchup"], root, 12)
    cyl("ketchup_cap", T(1.2, 2.5, 1.2), 0.015, 0.04, m["black"], root, 8, r2=0.006)
    cyl("tip_jar", T(2.8, 2.6, 1.1), 0.05, 0.14, m["glass"], root, 16)
    cyl("pick_cup", T(1.45, 2.45, 1.06), 0.025, 0.07, m["steel"], root, 12)
    for i in range(5):
        a = i * 1.25
        rod("pick", T(1.45 + math.cos(a) * 0.01, 2.45 + math.sin(a) * 0.01, 1.05), T(1.45 + math.cos(a) * 0.025, 2.45 + math.sin(a) * 0.025, 1.17), 0.002, m["wood2"], root, 5)
    burger(m, root, 2.1, -2.5, 1.02, 1.4)
    box("board", (2.1, -2.5, 1.025), (0.32, 0.2, 0.02), m["wood2"], root)
    # The out-of-date happy hour sign.
    box("hh_frame", T(6.4, 2.4, 1.25), (0.32, 0.03, 0.42), m["wood3"], root, rot=(0.15, 0, 0))
    box("hh_board", T(6.4, 2.42, 1.25), (0.27, 0.01, 0.36), m["board"], root, rot=(0.15, 0, 0))
    for i in range(4):
        box("hh_text", T(6.4, 2.43, 1.36 - i * 0.07), (0.2 - (i % 2) * 0.06, 0.005, 0.015), m["chalk"], root, rot=(0.15, 0, 0))
    export("counter")


def build_kitchen():
    m = M()
    root = empty("kitchen")
    # Flat-top grill.
    box("grill_body", T(1.75, 0.6, 0.43), (2.7, 0.85, 0.86), m["darksteel"], root, 0.01)
    box("grill_top", T(1.75, 0.6, 0.88), (2.7, 0.85, 0.04), mat("griddle", "#2a2b2d", 0.5, 0.7), root)
    box("grill_lip", T(1.75, 0.2, 0.95), (2.7, 0.04, 0.12), m["steel"], root)
    for i in range(5):
        cyl("patty", T(0.75 + i * 0.5, 0.65, 0.91), 0.1, 0.02, m["patty"], root, 10, smooth=False)
    box("spatula", T(2.9, 0.85, 0.92), (0.1, 0.25, 0.01), m["steel"], root)
    # Fryer with two baskets.
    box("fryer", T(4.05, 0.57, 0.45), (1.3, 0.85, 0.9), m["steel"], root, 0.01)
    box("oil", T(4.05, 0.55, 0.905), (1.1, 0.6, 0.01), mat("oil", "#c9a227", 0.1, 0, "#c9a227", 0.3), root)
    for x in (3.75, 4.35):
        box("basket", T(x, 0.55, 0.93), (0.35, 0.4, 0.06), m["steel"], root)
        rod("basket_handle", T(x, 0.75, 0.95), T(x, 0.95, 1.05), 0.012, m["black"], root)
    # Stainless reach-in fridge.
    box("fridge", T(5.85, 0.5, 1.05), (1.45, 0.8, 2.1), m["steel"], root, 0.015)
    box("fridge_split", T(5.85, 0.905, 1.05), (0.01, 0.01, 2.0), m["darksteel"], root)
    for x in (5.75, 5.95):
        box("fridge_handle", T(x, 0.93, 1.3), (0.03, 0.03, 0.6), m["darksteel"], root)
    # Hood vent over the grill.
    box("hood", T(1.75, 0.55, 2.4), (3.0, 1.0, 0.45), m["steel"], root, 0.01)
    box("hood_duct", T(1.75, 0.35, 2.9), (0.6, 0.5, 0.6), m["steel"], root)
    # Ticket rail.
    box("ticket_rail", T(3.5, 1.6, 1.55), (2.4, 0.04, 0.03), m["steel"], root)
    for i in range(5):
        box("ticket", T(2.6 + i * 0.4, 1.61, 1.47), (0.12, 0.005, 0.16), mat("ticket", "#f4f1e8", 0.9), root)
    export("kitchen")


# ----------------------------------------------------------------------------- props

def build_meal():
    m = M()
    root = empty("meal")
    box("board", (0, 0, 0.01), (0.42, 0.26, 0.02), m["wood2"], root, 0.004)
    burger(m, root, -0.07, 0, 0.02, 1.3)
    fries_basket(m, root, 0.13, 0.02, 0.02, 1.0)
    cyl("ramekin", (0.13, -0.09, 0.035), 0.025, 0.03, m["steel"], root, 12)
    cyl("ketchup", (0.13, -0.09, 0.045), 0.021, 0.015, m["ketchup"], root, 12)
    export("meal")


# ----------------------------------------------------------------------------- characters

def build_person():
    """A chunky low-poly person. Parts are separate so the game can swing limbs and toggle accessories."""
    reset_mats = {
        "shirt": mat("shirt", "#a8322a", 0.85),
        "pants": mat("pants", "#2a2a35", 0.85),
        "skin": mat("skin", "#e0ac69", 0.7),
        "hands": mat("hands", "#e0ac69", 0.7),
        "hair": mat("hair", "#4a2c17", 0.9),
        "shoes": mat("shoes", "#1b1b1b", 0.6),
        "eye": mat("eye", "#111111", 0.4),
        "apron": mat("apron", "#151515", 0.85),
        "leather": mat("leather", "#7a4a2a", 0.6),
        "vest": mat("vest", "#7d8288", 0.8),
        "beanie": mat("beanie", "#8a6d3b", 0.95),
        "cap": mat("cap", "#1d3557", 0.8),
        "phone": mat("phone", "#202020", 0.3),
        "phone_screen": mat("phone_screen", "#bfe3ff", 0.2, 0, "#bfe3ff", 1.5),
    }
    p = reset_mats
    root = empty("person")

    for side, x in (("L", -0.11), ("R", 0.11)):
        leg = box(f"leg{side}", (x, 0, 0.42), (0.15, 0.17, 0.78), p["pants"], root, 0.02)
        set_origin(leg, (x, 0, 0.8))
        shoe = box(f"shoe{side}", (x, -0.04, 0.05), (0.16, 0.26, 0.1), p["shoes"], leg, 0.02)

    box("torso", (0, 0, 1.08), (0.44, 0.25, 0.6), p["shirt"], root, 0.04)
    for side, x in (("L", -0.29), ("R", 0.29)):
        arm = box(f"arm{side}", (x, 0, 1.08), (0.12, 0.14, 0.52), p["shirt"], root, 0.02)
        set_origin(arm, (x, 0, 1.33))
        hand = ball(f"hand{side}", (x, 0, 0.8), 0.065, p["hands"], arm, segs=10)
        if side == "R":
            ph = box("phone", (x, -0.07, 0.86), (0.08, 0.015, 0.15), p["phone"], arm, 0.004, rot=(0.3, 0, 0))
            scr = box("phone_screen", (x, -0.079, 0.86), (0.065, 0.004, 0.12), p["phone_screen"], ph, rot=(0.3, 0, 0))

    box("neck", (0, 0, 1.41), (0.12, 0.12, 0.08), p["skin"], root)
    head = box("head", (0, 0, 1.6), (0.32, 0.3, 0.32), p["skin"], root, 0.06)
    for x in (-0.07, 0.07):
        box("eye", (x, -0.152, 1.62), (0.035, 0.01, 0.045), p["eye"], head)
    box("hair_top", (0, 0.01, 1.775), (0.34, 0.33, 0.07), p["hair"], root, 0.03)
    box("hair_back", (0, 0.13, 1.66), (0.34, 0.07, 0.24), p["hair"], root, 0.02)

    beard = box("beard", (0, -0.1, 1.44), (0.3, 0.13, 0.22), p["hair"], root, 0.04)
    set_origin(beard, (0, -0.1, 1.55))
    box("mustache", (0, -0.16, 1.55), (0.16, 0.03, 0.035), p["hair"], beard)

    ball("bun", (0, 0.06, 1.88), 0.075, p["hair"], root, segs=10)
    box("longhair", (0, 0.12, 1.45), (0.36, 0.1, 0.5), p["hair"], root, 0.03)
    beanie = box("beanie", (0, 0.01, 1.8), (0.36, 0.35, 0.16), p["beanie"], root, 0.05)
    ball("pom", (0, 0.01, 1.9), 0.05, p["beanie"], beanie, segs=8)
    cap = box("cap", (0, 0.01, 1.79), (0.35, 0.34, 0.09), p["cap"], root, 0.03)
    box("cap_brim", (0, -0.22, 1.755), (0.28, 0.16, 0.02), p["cap"], cap)
    glasses = box("glasses", (0, -0.158, 1.63), (0.26, 0.012, 0.012), p["eye"], root)
    for x in (-0.07, 0.07):
        box("lens", (x, -0.16, 1.62), (0.09, 0.008, 0.07), mat("lens", "#111111", 0.1, 0, alpha=0.5), glasses)
    apron = box("apron", (0, -0.135, 0.92), (0.38, 0.025, 0.76), p["apron"], root, 0.01)
    for x in (-0.12, 0.12):
        box("strap", (x, -0.135, 1.33), (0.035, 0.02, 0.1), p["leather"], apron)
    box("apron_pocket", (0, -0.15, 0.85), (0.24, 0.01, 0.12), p["apron"], apron)
    vest = box("vest", (0, 0.005, 1.12), (0.47, 0.27, 0.48), p["vest"], root, 0.03)
    box("vest_gap", (0, -0.138, 1.12), (0.1, 0.01, 0.48), p["shirt"], vest)

    export("person")


# ----------------------------------------------------------------------------- main

BUILDERS = [
    build_table, build_stool, build_edison, build_strings, build_chalk, build_eat, build_taps, build_garage,
    build_counter, build_kitchen, build_meal, build_person,
]

only = sys.argv[sys.argv.index("--") + 2:] if "--" in sys.argv else []
for b in BUILDERS:
    name = b.__name__.removeprefix("build_")
    if only and name not in only:
        continue
    reset()
    b()
