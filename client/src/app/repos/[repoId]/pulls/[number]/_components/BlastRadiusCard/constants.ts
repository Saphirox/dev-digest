/** Cap on the number of nodes `helpers.buildBlastMermaid` will emit — keeps a
 *  wide blast radius (many callers/endpoints) readable and the mermaid SVG
 *  render fast. `graph.truncated` tells the user more nodes were dropped. */
export const GRAPH_MAX_NODES = 40;
