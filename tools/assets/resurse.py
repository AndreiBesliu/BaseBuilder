# -*- coding: utf-8 -*-
"""
Mormanele de resurse ale jocului, generate in Blender — DETERMINIST, din cod, nu desenate de mana.

DESIGN §8: „costul artistic devine numarul de materiale, nu numarul de modele"; identitatea sta in
lumina si in culoare, nu in geometrie. Deci fiecare morman e geometrie simpla, fatetata, cu CULOARE PE
VARF (ca terenul si voxelii viewer-ului), din paleta lui src/render/palette.ts, si un singur material.

Ce iese:
  - un .glb cu 12 plase: <fel>_<treapta>, fel in {piatra, pamant, lemn, hrana}, treapta 0/1/2
    (mic / mediu / mare, dupa cantitatea din morman — vezi viewer/resurse.ts). Originea e in centrul
    BAZEI, amprenta incape in ±0,45 m (o celula), iar inaltimea creste cu treapta;
  - iconitele UI-ului, 128×128, fundal transparent, din treapta mare;
  - o foaie de previzualizare cu toate 12, pentru ochi.

Rulare (Blender 4.3, fara interfata):
  "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b --factory-startup -P tools/assets/resurse.py -- \
      --glb viewer/public/resurse/mormane.glb --icoane viewer/public/resurse/icoane --foaie <fisier.png>

(`public/resurse`, nu `public/assets`: Vite isi pune bucatile de build in `assets/`, iar cele doua s-ar
amesteca in dist-viewer.)

Determinismul: fiecare plasa are samanta ei (random.Random(nume)), deci aceeasi versiune de Blender
da aceeasi geometrie. Contractul fisierului (nume, bugetul de triunghiuri, amprenta, culoarea pe varf)
il verifica tests/resurse.test.ts, fara Blender.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(nume, implicit=None):
    return ARGS[ARGS.index(nume) + 1] if nume in ARGS else implicit


# Paleta (src/render/palette.ts si variabilele --res-* din viewer/ui/ui.css), in sRGB 0..1.
def hexrgb(h):
    return ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255


ROCA = hexrgb(0x6b6a66)
PIATRA = hexrgb(0x9a968c)
PAMANT = hexrgb(0x6a5a45)
PAMANT_INCHIS = hexrgb(0x4d4133)
SCOARTA = hexrgb(0x5a4430)
LEMN_MIEZ = hexrgb(0xc9a36b)
SAC = hexrgb(0xb89a64)
SFOARA = hexrgb(0x7a6245)
RADACINA = hexrgb(0xc98a3c)
DOVLEAC = hexrgb(0xd8a23a)
VERDE = hexrgb(0x7d8a3c)

AMPRENTA = 0.45  # jumatate de latura: tot mormanul incape in ±0,45 m


def variaza(rng, c, cat=0.08):
    """O culoare cu o abatere mica si determinista, pe luminozitate: bucatile nu mai sunt identice."""
    k = 1 + rng.uniform(-cat, cat)
    return tuple(max(0.0, min(1.0, x * k)) for x in c)


class Plasa:
    """Un bmesh cu un strat de culoare pe colt; piesele se adauga si se coloreaza pe fata."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')

    def adauga(self, geom_faces, culoare_fata):
        for f in geom_faces:
            c = culoare_fata(f)
            for l in f.loops:
                l[self.col] = (c[0], c[1], c[2], 1.0)

    def piesa(self, construieste, transform, culoare_fata):
        """`construieste(bm)` intoarce fetele noi; `transform` le muta; `culoare_fata(f)` le coloreaza."""
        inainte = set(self.bm.faces)
        construieste(self.bm)
        noi = [f for f in self.bm.faces if f not in inainte]
        verts = {v for f in noi for v in f.verts}
        bmesh.ops.transform(self.bm, matrix=transform, verts=list(verts))
        self.adauga(noi, culoare_fata)
        return noi

    def obiect(self, nume, material):
        me = bpy.data.meshes.new(nume)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        # Stratul de culoare trebuie sa fie ACTIV si de randare: altfel Workbench il ignora (negru) si
        # exportorul glTF nu scrie COLOR_0.
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
        for p in me.polygons:
            p.use_smooth = False
        me.materials.append(material)
        ob = bpy.data.objects.new(nume, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def lumina_fata(baza, rng, cat=0.1):
    """Culoarea unei fete: baza, un pic mai inchisa spre jos (ocluzie ieftina), cu variatie."""
    def f(face):
        z = face.calc_center_median().z
        k = 0.78 + 0.22 * min(1.0, max(0.0, z / 0.5))
        return variaza(rng, tuple(x * k for x in baza), cat)
    return f


def strung(bm, profil, segmente):
    """Un corp de rotatie din profilul (raza, z), de jos in sus; capac jos daca raza de jos > 0. Intoarce fetele noi."""
    inele = []
    for (r, z) in profil:
        if r <= 1e-6:
            inele.append([bm.verts.new((0, 0, z))])
        else:
            inele.append([bm.verts.new((r * math.cos(2 * math.pi * k / segmente), r * math.sin(2 * math.pi * k / segmente), z)) for k in range(segmente)])
    fete = []
    for a, b in zip(inele, inele[1:]):
        for k in range(segmente):
            if len(a) == 1:
                fete.append(bm.faces.new((a[0], b[k], b[(k + 1) % segmente])))
            elif len(b) == 1:
                fete.append(bm.faces.new((a[k], a[(k + 1) % segmente], b[0])))
            else:
                fete.append(bm.faces.new((a[k], a[(k + 1) % segmente], b[(k + 1) % segmente], b[k])))
    if len(inele[0]) > 1:
        fete.append(bm.faces.new(list(reversed(inele[0]))))
    return fete


def icosfera(bm, subdiviziuni=0, raza=1.0):
    return bmesh.ops.create_icosphere(bm, subdivisions=subdiviziuni, radius=raza)


def bolovan(rng, raza, turtire):
    """Un bolovan fatetat: icosaedru cu varfurile impinse aleator, turtit."""
    def construieste(bm):
        rez = icosfera(bm, 0, raza)
        for v in rez['verts']:
            v.co *= 1 + rng.uniform(-0.22, 0.22)
            v.co.z *= turtire
    return construieste


def transform(x, y, z, rot_z=0.0, rot_x=0.0, scara=(1, 1, 1)):
    return (Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Rotation(rot_x, 4, 'X')
            @ Matrix.Diagonal((scara[0], scara[1], scara[2], 1)))


# ---------------------------------------------------------------------------------------------
# cele patru resurse, pe trei trepte
# ---------------------------------------------------------------------------------------------

def piatra(treapta, material):
    """Un maldar de bucati de piatra: un strat lat jos, mai putine si mai mici spre varf."""
    rng = random.Random(f'piatra_{treapta}')
    p = Plasa()
    straturi = [[5], [7, 4], [8, 6, 3]][treapta]
    z = 0.0
    for i, n in enumerate(straturi):
        r_inel = [0.24, 0.16, 0.08][i] if n > 1 else 0.0
        marime = [0.13, 0.115, 0.10][i]
        for k in range(n):
            a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3) + i * 0.5
            rr = r_inel * rng.uniform(0.75, 1.1)
            raza = marime * rng.uniform(0.85, 1.15)
            p.piesa(bolovan(rng, raza, 0.7), transform(math.cos(a) * rr, math.sin(a) * rr, z + raza * 0.55, rng.uniform(0, 6.28)),
                    lumina_fata(variaza(rng, PIATRA if rng.random() < 0.7 else ROCA, 0.06), rng, 0.07))
        z += marime * 1.05
    return p.obiect(f'piatra_{treapta}', material)


def pamant(treapta, material):
    """O movila de pamant, cu bulgari deasupra."""
    rng = random.Random(f'pamant_{treapta}')
    p = Plasa()
    inaltime = [0.16, 0.3, 0.44][treapta]
    raza = [0.28, 0.36, 0.42][treapta]

    def movila(bm):
        rez = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
        for v in rez['verts']:
            if v.co.z < 0:
                v.co.z = 0
            else:
                j = 1 + rng.uniform(-0.12, 0.12)
                v.co.x *= j
                v.co.y *= j
                v.co.z *= 1 + rng.uniform(-0.1, 0.1)
        # Baza plata nu se vede: fetele de dedesubt (toate pe z = 0) se scot.
        jos = [f for f in bm.faces if f in set(f for v in rez['verts'] for f in v.link_faces) and all(v.co.z <= 1e-6 for v in f.verts)]
        bmesh.ops.delete(bm, geom=jos, context='FACES')

    p.piesa(movila, transform(0, 0, 0, rng.uniform(0, 6.28), scara=(raza, raza * 0.92, inaltime)), lumina_fata(PAMANT, rng, 0.06))
    for k in range(2 + 2 * treapta):
        a = rng.uniform(0, 6.28)
        rr = raza * rng.uniform(0.2, 0.7)
        h = inaltime * (1 - (rr / raza) ** 2) ** 0.5
        m = rng.uniform(0.05, 0.08)
        p.piesa(bolovan(rng, m, 0.8), transform(math.cos(a) * rr, math.sin(a) * rr, h + m * 0.2, rng.uniform(0, 6.28)),
                lumina_fata(PAMANT_INCHIS, rng, 0.08))
    return p.obiect(f'pamant_{treapta}', material)


def lemn(treapta, material):
    """Busteni stivuiti in piramida: 2+1, 3+2+1, 4+3+2+1."""
    rng = random.Random(f'lemn_{treapta}')
    p = Plasa()
    randuri = [[2, 1], [3, 2, 1], [4, 3, 2, 1]][treapta]
    lungime = 0.8
    raza = [0.085, 0.075, 0.068][treapta]
    for r, n in enumerate(randuri):
        for k in range(n):
            y = (k - (n - 1) / 2) * raza * 2.05
            z = raza + r * raza * 1.78
            rot = rng.uniform(-0.06, 0.06)
            rz = raza * rng.uniform(0.92, 1.08)

            def bustean(bm, rz=rz):
                bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6, radius1=rz, radius2=rz, depth=lungime * rng.uniform(0.9, 1.0))

            miez = variaza(rng, LEMN_MIEZ, 0.05)
            scoarta = variaza(rng, SCOARTA, 0.1)

            def culoare(f, miez=miez, scoarta=scoarta):
                # Capetele (normala de-a lungul bustenului) arata miezul; restul, scoarta.
                return miez if abs(f.normal.x) > 0.9 else variaza(rng, scoarta, 0.06)

            noi = p.piesa(bustean, transform(rng.uniform(-0.03, 0.03), y, z, rot) @ Matrix.Rotation(math.pi / 2, 4, 'Y'), lambda f: (1, 1, 1))
            p.bm.normal_update()
            p.adauga(noi, culoare)
    return p.obiect(f'lemn_{treapta}', material)


def hrana(treapta, material):
    """Saci legati la gura si cateva radacini si dovleci langa ei."""
    rng = random.Random(f'hrana_{treapta}')
    p = Plasa()
    saci = [[(0, 0)], [(-0.14, 0.02), (0.15, -0.04)], [(-0.16, -0.1), (0.16, -0.08), (0.0, 0.16)]][treapta]
    for (x, y) in saci:
        h = rng.uniform(0.3, 0.36)
        r = rng.uniform(0.14, 0.16)
        # Profilul unui sac plin: fund lat, burta, umeri, gat strans, smoc deasupra.
        corp = [(r * 0.78, 0.0), (r * 0.98, h * 0.12), (r, h * 0.42), (r * 0.9, h * 0.7), (r * 0.52, h * 0.88), (r * 0.2, h * 0.95)]
        smoc = [(r * 0.2, h * 0.95), (r * 0.33, h * 1.06), (r * 0.12, h * 1.13), (0.0, h * 1.15)]
        p.piesa(lambda bm, corp=corp: strung(bm, corp, 7), transform(x, y, 0, rng.uniform(0, 6.28)), lumina_fata(SAC, rng, 0.07))
        p.piesa(lambda bm, smoc=smoc: strung(bm, smoc, 5), transform(x, y, 0), lambda f: variaza(rng, SAC, 0.05))
        p.piesa(lambda bm, r=r, h=h: strung(bm, [(r * 0.24, h * 0.92), (r * 0.24, h * 0.99)], 5), transform(x, y, 0), lambda f: SFOARA)
    for k in range(2 + treapta):
        a = rng.uniform(0, 6.28)
        rr = rng.uniform(0.26, 0.36)
        dovleac = rng.random() < 0.4
        m = rng.uniform(0.06, 0.08) if dovleac else rng.uniform(0.045, 0.06)

        def rod(bm, m=m, dovleac=dovleac):
            rez = icosfera(bm, 0, m)
            for v in rez['verts']:
                if dovleac:
                    v.co.z *= 0.75
                else:
                    v.co.x *= 1.8

        p.piesa(rod, transform(math.cos(a) * rr, math.sin(a) * rr, m * 0.7, rng.uniform(0, 6.28)),
                lumina_fata(DOVLEAC if dovleac else RADACINA, rng, 0.06))
        if dovleac:
            p.piesa(lambda bm, m=m: bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=4, radius1=0.012, radius2=0.008, depth=0.04),
                    transform(math.cos(a) * rr, math.sin(a) * rr, m * 0.7 + m * 0.75), lambda f: VERDE)
    return p.obiect(f'hrana_{treapta}', material)


# ---------------------------------------------------------------------------------------------
# scena, export, iconite
# ---------------------------------------------------------------------------------------------

def material_culoare():
    m = bpy.data.materials.new('resursa')
    m.use_nodes = True
    n = m.node_tree.nodes
    bsdf = n.get('Principled BSDF')
    atr = n.new('ShaderNodeVertexColor')
    atr.layer_name = 'Col'
    m.node_tree.links.new(atr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.95
    return m


def aseaza_in_amprenta(ob):
    """Garda: tot mormanul in ±AMPRENTA pe orizontala, cu baza pe z = 0. Scaleaza, nu taie."""
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    for v in ob.data.vertices:
        v.co.z -= min(zs)
    m = max(max(abs(x) for x in xs), max(abs(y) for y in ys))
    if m > AMPRENTA:
        k = AMPRENTA / m
        for v in ob.data.vertices:
            v.co.x *= k
            v.co.y *= k
            v.co.z *= k


def randeaza(obiecte, fisier, latime, inaltime, pas):
    """Workbench cu culoarea pe varf: iconitele si foaia arata culorile exact, fara lumina scumpa."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'VERTEX'
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.render.film_transparent = True
    sc.render.resolution_x = latime
    sc.render.resolution_y = inaltime
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            o.hide_render = o not in obiecte
    # Obiectele pe un rand, la `pas` metri unul de altul; camera ortografica din 3/4, ca viewer-ul.
    # Camera priveste din (1, -1): axa orizontala a ecranului e (1, 1)/√2 — acolo se insira obiectele.
    ax = Vector((1, 1, 0)).normalized()
    for i, o in enumerate(obiecte):
        o.location = ax * (i * pas)
    cam = bpy.data.objects.get('camera')
    if cam is None:
        cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
        sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    centru = Vector((1, 1, 0)).normalized() * ((len(obiecte) - 1) * pas / 2) + Vector((0, 0, 0.26))
    directie = Vector((1, -1, 0.95)).normalized()
    cam.location = centru + directie * 6
    cam.rotation_euler = (-directie).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = len(obiecte) * pas * 1.02 if len(obiecte) > 1 else 1.12
    sc.camera = cam
    sc.render.filepath = fisier
    bpy.ops.render.render(write_still=True)
    for o in obiecte:
        o.location = (0, 0, 0)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material = material_culoare()
    fabrici = {'piatra': piatra, 'pamant': pamant, 'lemn': lemn, 'hrana': hrana}
    obiecte = {}
    for fel, f in fabrici.items():
        for t in range(3):
            ob = f(t, material)
            aseaza_in_amprenta(ob)
            obiecte[f'{fel}_{t}'] = ob
            tri = sum(len(p.vertices) - 2 for p in ob.data.polygons)
            print(f'{ob.name}: {len(ob.data.vertices)} varfuri, {tri} triunghiuri, inaltime {max(v.co.z for v in ob.data.vertices):.2f} m')

    glb = arg('--glb')
    if glb:
        os.makedirs(os.path.dirname(os.path.abspath(glb)), exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        for o in obiecte.values():
            o.select_set(True)
        optiuni = dict(filepath=os.path.abspath(glb), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                       export_texcoords=False, export_normals=True, export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False)
        try:
            bpy.ops.export_scene.gltf(**optiuni, export_vertex_color='ACTIVE')
        except TypeError:
            bpy.ops.export_scene.gltf(**optiuni, export_colors=True)
        print('glb:', glb, os.path.getsize(glb), 'octeti')

    icoane = arg('--icoane')
    if icoane:
        os.makedirs(icoane, exist_ok=True)
        for fel in fabrici:
            randeaza([obiecte[f'{fel}_2']], os.path.abspath(os.path.join(icoane, f'{fel}.png')), 128, 128, 1.2)
        print('iconite:', icoane)

    foaie = arg('--foaie')
    if foaie:
        # Treptele unei resurse pe un rand; cele patru resurse, una dupa alta.
        for fel in fabrici:
            randeaza([obiecte[f'{fel}_{t}'] for t in range(3)], os.path.abspath(foaie.replace('.png', f'-{fel}.png')), 768, 320, 1.1)
        print('foaie:', foaie)


main()
