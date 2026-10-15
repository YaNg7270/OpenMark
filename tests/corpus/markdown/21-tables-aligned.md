# Aligned Table Variants

Column alignment in GFM tables is expressed with colons inside the
delimiter row. A leading colon aligns the column to the left, a pair of
colons centres it, and a trailing colon aligns it to the right.

**Left aligned columns**

| Command | Purpose | Exit Code |
| :--- | :--- | :--- |
| build | compile every source file | 0 |
| test | run the unit suite | 1 |
| lint | check the house style | 2 |

**Centre aligned columns**

| Host | Role | Zone |
| :---: | :---: | :---: |
| alpha | primary | east |
| beta | replica | west |
| gamma | witness | north |

**Right aligned columns**

| Region | Latency | Weight |
| ---: | ---: | ---: |
| east | 12 | 0.6 |
| west | 34 | 0.3 |
| north | 58 | 0.1 |

Each table above uses a different alignment token. A renderer that
understands the colon syntax should therefore lay out the three tables
in three visibly different ways, while a parser that ignores alignment
still reports the same cell contents for every row.

Alignment has no effect on the number of cells. Even a column declared
as right aligned still occupies one slot per row, so counting rules do
not depend on the colons at all.

A writer may also leave one column unaligned and mark the neighbours,
which is a common way to keep the delimiter row short while still
controlling the shape of the two numeric columns.

Nothing else in this file changes the column count.
