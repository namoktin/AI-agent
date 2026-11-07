house_miles = [0, 7, 11, 15, 24, 27, 29]
radius = 4

towers = []
i = 0
n = len(house_miles)
while i < n:
    left_house = house_miles[i]
    tower_pos = left_house + radius
    towers.append(tower_pos)
    while i < n and house_miles[i] <= tower_pos + radius:
        i += 1

print(f"Minimum towers needed: {len(towers)}")
print(f"Tower positions: {towers}")
