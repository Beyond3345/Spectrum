// Document
#set document(                                  // the title and author, also shown in the PDF's properties
  title: [Assignment 2: Shortest paths in weighted graphs],
  author: "Your Name",
)

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography
#show bibliography: it => context if query(cite).len() > 0 { it } // no References heading until something is cited

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures

// Code
#set raw(tab-size: 4)                           // a tab in code is four spaces wide
#show raw.where(block: true): it => block(      // code in a light box, with line numbers down the left
  width: 100%, fill: luma(249), stroke: 0.5pt + luma(204), inset: (x: 0.5em, y: 0.65em),
  grid(columns: (auto, 1fr), column-gutter: 0.8em, row-gutter: 0.65em, align: (right, start),
    ..it.lines.map(line => (text(fill: luma(128), size: 0.8em, str(line.number)), line)).flatten()),
)
#show figure.where(kind: raw): set figure.caption(position: top) // listing captions above the code
#show figure.where(kind: raw): set block(breakable: true) // a long listing may run onto the next page

#align(center)[
  #title()
  Your Name \
  Student number 12345678 \
  Due 24 October 2026
]

= Introduction

This report describes an implementation of Dijkstra's algorithm, which finds the length of the shortest path
from one vertex to every other vertex of a graph whose edge weights are non-negative. @sec:method gives the
algorithm, @sec:code the code, and @sec:analysis its running time.

= Method <sec:method>

@alg:dijkstra keeps a tentative distance $d[v]$ for every vertex and a priority queue of vertices to visit,
always taking the closest unvisited vertex next. Rather than lowering a key already in the queue, it pushes a
new entry and skips stale ones when they come out, which suits a plain binary heap.

#figure(
  kind: "algorithm", supplement: [Algorithm],
  caption: [Dijkstra's algorithm with a binary heap.],
  align(start)[
    *Input:* a graph $G = (V, E)$ with weights $w(u, v) >= 0$, and a source $s in V$ \
    *Output:* $d[v]$, the length of a shortest path from $s$ to each $v$
    + $d[v] <- infinity$ for every $v in V$, and $d[s] <- 0$
    + $Q <- {(0, s)}$ #h(1fr) $triangle.r$ a min-priority queue of (distance, vertex)
    + *while* $Q$ is not empty *do*
    + #h(1.5em) $(k, u) <-$ #smallcaps[ExtractMin]$(Q)$
    + #h(1.5em) *if* $k > d[u]$ *then*
    + #h(3em) *continue* #h(1fr) $triangle.r$ a stale entry
    + #h(1.5em) *end if*
    + #h(1.5em) *for all* edges $(u, v) in E$ *do*
    + #h(3em) *if* $d[u] + w(u, v) < d[v]$ *then*
    + #h(4.5em) $d[v] <- d[u] + w(u, v)$
    + #h(4.5em) #smallcaps[Insert]$(Q, (d[v], v))$
    + #h(3em) *end if*
    + #h(1.5em) *end for*
    + *end while*
    + *return* $d$
  ],
) <alg:dijkstra>

= Implementation <sec:code>

@lst:python implements @alg:dijkstra in Python, using the standard library's `heapq` module as the queue.
The call `heapq.heappop(queue)` returns the entry with the smallest distance.

#figure(
  ```python
  import heapq

  def dijkstra(graph, source):
      """Return the shortest distance from source to every reachable vertex."""
      dist = {source: 0}
      queue = [(0, source)]
      while queue:
          d, u = heapq.heappop(queue)
          if d > dist[u]:
              continue  # stale entry: u was already reached by a shorter path
          for v, weight in graph[u]:
              if d + weight < dist.get(v, float("inf")):
                  dist[v] = d + weight
                  heapq.heappush(queue, (dist[v], v))
      return dist

  graph = {
      "A": [("B", 4), ("C", 1)],
      "B": [("D", 1)],
      "C": [("B", 2), ("D", 5)],
      "D": [],
  }
  print(dijkstra(graph, "A"))  # {'A': 0, 'B': 3, 'C': 1, 'D': 4}
  ```,
  caption: [Dijkstra's algorithm in Python.],
) <lst:python>

The inner step, relaxing one edge, is the same in any language. @lst:c shows it in C, where an unreached
vertex has distance `INT_MAX`.

#figure(
  ```c
  #include <limits.h>

  /* Relax the edge (u, v) with weight w; returns 1 when dist[v] got shorter. */
  int relax(int dist[], int u, int v, int w)
  {
      if (dist[u] != INT_MAX && dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w;
          return 1;
      }
      return 0;
  }
  ```,
  caption: [Relaxing an edge in C.],
) <lst:c>

= Analysis <sec:analysis>

Every edge is relaxed at most once, and each relaxation can push one entry onto the queue, so with a binary
heap the algorithm runs in $O(lr(((|V| + |E|) log |V|), size: #120%))$ time. @tab:queues compares this with
other choices of priority queue.

#figure(
  table(
    columns: 4,
    align: (left, center, center, center),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Priority queue], [Decrease-key], [Extract-min], [Total]),
    table.hline(stroke: 0.05em),
    [Unsorted array], [$O(1)$], [$O(|V|)$], [$O(|V|^2)$],
    [Binary heap], [$O(log |V|)$], [$O(log |V|)$], [$O(lr(((|V| + |E|) log |V|), size: #120%))$],
    [Fibonacci heap], [$O(1)$ amortised], [$O(log |V|)$ amortised], [$O(|E| + |V| log |V|)$],
    table.hline(stroke: 0.08em),
  ),
  caption: [Running time of Dijkstra's algorithm by priority queue.],
) <tab:queues>

For sparse graphs, where $|E|$ is close to $|V|$, the binary heap is the practical choice; the unsorted array
only wins on dense graphs with $|E|$ close to $|V|^2$.

#bibliography("refs.bib", style: "apa")
