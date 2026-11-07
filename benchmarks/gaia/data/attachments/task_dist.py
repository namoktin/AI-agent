import math, os

PATH = "C:/Users/Nam/Desktop/AI agent/benchmarks/gaia/data/attachments/7dd30055-0198-452e-8c25-f73dbe27dcb8.pdb"
print("exists:", os.path.exists(PATH), "size:", os.path.getsize(PATH) if os.path.exists(PATH) else -1)

# ---- 1) Biopython parse (as required by task) ----
try:
    from Bio.PDB import PDBParser
    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("5WB7", PATH)
    atoms = []
    for atom in structure.get_atoms():
        atoms.append(atom)
    a1, a2 = atoms[0], atoms[1]
    c1, c2 = a1.get_coord(), a2.get_coord()
    print("Bio.PDB atoms[0]:", a1.get_parent().get_parent().id, a1.get_parent().id, a1.get_name(), c1)
    print("Bio.PDB atoms[1]:", a2.get_parent().get_parent().id, a2.get_parent().id, a2.get_name(), c2)
    d_bio = math.dist(c1, c2)
    print("Bio.PDB distance = %.10f" % d_bio)
except Exception as e:
    print("Biopython unavailable/error:", repr(e))
    d_bio = None

# ---- 2) Raw PDB ATOM/HETATM column parse (first two atoms in file order) ----
recs = []
with open(PATH) as fh:
    for line in fh:
        if line.startswith(("ATOM  ", "HETATM")):
            recs.append(line)
print("total atom records:", len(recs))
print("RECORD 1:", recs[0].rstrip())
print("RECORD 2:", recs[1].rstrip())

def parse(l):
    return dict(
        rec=l[0:6].strip(), serial=l[6:11].strip(), name=l[12:16].strip(),
        altloc=l[16:17], resname=l[17:20].strip(), chain=l[21:22],
        resseq=l[22:26].strip(), icode=l[26:27],
        x=float(l[30:38]), y=float(l[38:46]), z=float(l[46:54]),
        occ=float(l[54:60]), b=float(l[60:66]), element=l[76:78].strip(),
    )

r1, r2 = parse(recs[0]), parse(recs[1])
print("P1:", r1)
print("P2:", r2)

d = math.sqrt((r1['x']-r2['x'])**2 + (r1['y']-r2['y'])**2 + (r1['z']-r2['z'])**2)
print("raw distance (full precision) = %.12f" % d)
# exact using Decimals-free high precision
from decimal import Decimal, getcontext
getcontext().prec = 50
dx = Decimal(r1['x'].hex().__str__()) if False else None
dd = math.dist((r1['x'], r1['y'], r1['z']), (r2['x'], r2['y'], r2['z']))
print("math.dist = %.12f" % dd)

print("Rounded to nearest picometer (3 decimals):", round(dd, 3))
print("Rounded to 2 decimals:", round(dd, 2))
if d_bio is not None:
    print("Bio == raw:", abs(d_bio - dd) < 1e-12)
