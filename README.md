# Broken Wagon

A long-form browser survival simulation inspired by the decision pressure of early trail games, rebuilt around a real-time journey to California during the Gold Rush.

## Prototype rule

**One real hour = one full daylight period. One real hour = one full night.**

There are no energy points or artificial action limits. The shared clock keeps moving while the page is open. Hunting, repairs, scouting, camp cleanup, guard duty, and other work consume actual trail time. Closing the page freezes the simulation exactly where it is. No offline progression.

## Prototype contents

This first playable slice includes:

- provisional Boston-to-Sacramento route
- east-to-west ASCII route map with California/Pacific on the left, New England/Atlantic on the right, and the live party marker traveling west
- continuous daylight travel
- one-hour daylight / one-hour night cycle
- pause/play hard freeze
- autosave with no offline advancement
- party, food, ammunition, cash, wagon, oxen, repair supplies, medicine
- hunting versus travel opportunity cost
- wagon repair time
- scouting
- night watch and wolf pressure
- river-crossing decisions
- diplomacy / goodwill framework
- trail trace and litter/sign system
- bandit-attention pressure based partly on how obvious a trail the party leaves
- trail journal

The route and historical event set are deliberately provisional. The prototype is for proving the simulation loop before locking the final starting point, route, nations encountered, settlements, prices, dates, and historical encounter tables.

## Play

Broken Wagon is a GitHub Pages web app:

**https://dereksparks1982.github.io/brokenwagon/**

For rapid testing, add `?dev=1` to the web-app URL. Dev mode runs the authoritative trail clock at 60x speed. Normal play always uses the intended real-time clock.

## Reference study

The uploaded Oregon Trail archive was examined as a design reference. Its original BASIC loop repeatedly exposes the same useful pressure points: supplies, travel progress, hunting versus movement, forts, eating level, random incidents, breakdowns, weather, river loss, animal attacks, illness, and cumulative attrition. Broken Wagon does not copy that implementation. It uses those old design lessons as raw material for a persistent real-time simulation.

The uploaded Mormon Trail v0.02 archive contains the Windows executable rather than its source tree. Inspection of the executable shows a small console game beginning at Nauvoo with food purchasing, health, money, named trail stops such as Fort Kearney, Fort Laramie, and Salt Lake City, and day-of-week handling. It is being treated only as another historical design reference.