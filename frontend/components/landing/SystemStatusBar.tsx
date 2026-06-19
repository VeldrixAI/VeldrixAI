"use client";

import { useState, useEffect } from "react";

interface EdgeNode {
  region: string;
  status: "operational" | "degraded" | "offline";
  latency: number;
}

const EDGE_NODES: EdgeNode[] = [
  { region: "NA-EAST", status: "operational", latency: 12 },
  { region: "NA-WEST", status: "operational", latency: 18 },
  { region: "EU-WEST", status: "operational", latency: 34 },
  { region: "APAC", status: "degraded", latency: 89 },
];

export function SystemStatusBar() {
  const [nodes, setNodes] = useState(EDGE_NODES);
  const [uptime, setUptime] = useState(99.97);

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes((prev) =>
        prev.map((node) => ({
          ...node,
          latency: node.status === "operational" 
            ? node.latency + Math.floor(Math.random() * 10 - 5)
            : node.latency,
        }))
      );
      setUptime(99.9 + Math.random() * 0.1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = nodes.every((n) => n.status === "operational")
    ? "operational"
    : nodes.some((n) => n.status === "offline")
    ? "incident"
    : "degraded";

  return (
    <div className="vdx-status-bar">
      <div className="vdx-status-inner">
        <div className="vdx-status-main">
          <span className="vdx-status-label">All systems operational</span>
        </div>
        <div className="vdx-edge-nodes">
          {nodes.map((node) => (
            <div key={node.region} className="vdx-edge-node">
              <div className={`vdx-node-indicator vdx-node-${node.status}`} />
              <span className="vdx-node-region">{node.region}</span>
              <span className="vdx-node-latency">{node.latency}ms</span>
            </div>
          ))}
        </div>
        <div className="vdx-uptime">
          <span className="vdx-uptime-label">UPTIME</span>
          <span className="vdx-uptime-value">{uptime.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}
