
import React, { useRef, useEffect, useState } from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EnrichedTransaction, TransactionNode } from '@/types';
import { formatAddress } from '@/utils/solanaUtils';
import * as d3 from 'd3';

interface TransactionFlowProps {
  transactions: EnrichedTransaction[];
  expanded: boolean;
  onToggleExpand: () => void;
}

const TransactionFlow: React.FC<TransactionFlowProps> = ({ 
  transactions, 
  expanded, 
  onToggleExpand 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  
  // Extract transaction nodes from transactions
  const nodes = React.useMemo(() => {
    const nodeMap = new Map<string, TransactionNode>();
    
    transactions.forEach(tx => {
      const sender = tx.parsedInfo?.sender;
      const receiver = tx.parsedInfo?.receiver;
      const amount = tx.parsedInfo?.amount || 0;
      const risk = tx.riskScore || 0;
      
      if (sender) {
        if (!nodeMap.has(sender)) {
          nodeMap.set(sender, {
            id: sender,
            address: sender,
            volume: 0,
            riskScore: 0,
            outgoing: new Set(),
            incoming: new Set(),
            type: 'wallet'
          });
        }
        
        const node = nodeMap.get(sender)!;
        if (receiver) {
          node.outgoing.add(receiver);
          node.volume += amount;
          node.riskScore = Math.max(node.riskScore, risk);
        }
      }
      
      if (receiver) {
        if (!nodeMap.has(receiver)) {
          nodeMap.set(receiver, {
            id: receiver,
            address: receiver,
            volume: 0,
            riskScore: 0,
            outgoing: new Set(),
            incoming: new Set(),
            type: 'wallet'
          });
        }
        
        const node = nodeMap.get(receiver)!;
        if (sender) {
          node.incoming.add(sender);
          node.volume += amount;
          node.riskScore = Math.max(node.riskScore, risk);
        }
      }
    });
    
    return Array.from(nodeMap.values());
  }, [transactions]);
  
  // Generate links from nodes
  const links = React.useMemo(() => {
    const linkArray: {source: string; target: string; value: number; risk: number}[] = [];
    
    nodes.forEach(node => {
      node.outgoing.forEach(target => {
        // Find transactions between this source and target
        const relatedTxs = transactions.filter(tx => 
          tx.parsedInfo?.sender === node.id && 
          tx.parsedInfo?.receiver === target
        );
        
        if (relatedTxs.length > 0) {
          const totalValue = relatedTxs.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
          const maxRisk = Math.max(...relatedTxs.map(tx => tx.riskScore || 0));
          
          linkArray.push({
            source: node.id,
            target,
            value: totalValue,
            risk: maxRisk
          });
        }
      });
    });
    
    return linkArray;
  }, [nodes, transactions]);
  
  // Use D3 to create the flow visualization
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Set up the simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));
    
    // Create a group for the zoom behavior
    const g = svg.append("g");
    
    // Draw the links
    const link = g.append("g")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("stroke", d => {
        const risk = d.risk;
        return risk > 70 ? 'rgba(239, 68, 68, 0.6)' : 
               risk > 40 ? 'rgba(245, 158, 11, 0.6)' : 
               'rgba(16, 185, 129, 0.6)';
      })
      .attr("stroke-width", d => Math.max(1, Math.min(5, Math.sqrt(d.value) / 2)))
      .attr("fill", "none")
      .attr("marker-end", "url(#arrowhead)");
    
    // Arrow marker for links
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");
    
    // Draw the nodes
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // Add circles for the nodes
    node.append("circle")
      .attr("r", d => Math.max(8, Math.min(20, 5 + Math.sqrt(d.volume) * 2)))
      .attr("fill", d => {
        const risk = d.riskScore;
        return risk > 70 ? 'rgba(239, 68, 68, 0.8)' : 
               risk > 40 ? 'rgba(245, 158, 11, 0.8)' : 
               'rgba(16, 185, 129, 0.8)';
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1.5);
    
    // Add labels for the nodes
    node.append("text")
      .attr("dy", 24)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "currentColor")
      .text(d => formatAddress(d.address, 4));
    
    // Add interactivity - highlight connected nodes on hover
    node.on("mouseover", function(event, d) {
      const connectedNodeIds = new Set([
        ...Array.from(d.outgoing),
        ...Array.from(d.incoming)
      ]);
      
      link
        .attr("opacity", l => 
          l.source.id === d.id || l.target.id === d.id ? 1 : 0.1
        );
      
      node
        .attr("opacity", n => 
          n.id === d.id || connectedNodeIds.has(n.id) ? 1 : 0.3
        );
    })
    .on("mouseout", function() {
      link.attr("opacity", 1);
      node.attr("opacity", 1);
    })
    .append("title")
    .text(d => `${d.address}\nVolume: ${d.volume.toFixed(2)} SOL\nRisk: ${d.riskScore}/100`);
    
    // Set up zoom behavior
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setZoom(event.transform.k);
      });
    
    svg.call(zoomBehavior as any);
    
    // Update positions on simulation tick
    simulation.on("tick", () => {
      link.attr("d", d => {
        const dx = (d.target as any).x - (d.source as any).x;
        const dy = (d.target as any).y - (d.source as any).y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        // Create a slight arc for the path
        return `M${(d.source as any).x},${(d.source as any).y}A${dr},${dr} 0 0,1 ${(d.target as any).x},${(d.target as any).y}`;
      });
      
      node.attr("transform", d => `translate(${(d as any).x},${(d as any).y})`);
    });
    
    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
      setIsDragging(true);
    }
    
    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
      setIsDragging(false);
    }
    
    // Reset zoom function
    const resetZoom = () => {
      svg.transition().duration(750).call(
        zoomBehavior.transform as any,
        d3.zoomIdentity,
        d3.zoomTransform(svg.node() as any).invert([width / 2, height / 2])
      );
    };
    
    return () => {
      simulation.stop();
    };
  }, [nodes, links, expanded]);
  
  // Handle zoom controls
  const handleZoomIn = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentZoom = d3.zoomTransform(svg.node() as any);
    svg.transition().duration(300).call(
      d3.zoom().transform as any,
      d3.zoomIdentity.scale(currentZoom.k * 1.3).translate(currentZoom.x, currentZoom.y)
    );
  };
  
  const handleZoomOut = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentZoom = d3.zoomTransform(svg.node() as any);
    svg.transition().duration(300).call(
      d3.zoom().transform as any,
      d3.zoomIdentity.scale(currentZoom.k / 1.3).translate(currentZoom.x, currentZoom.y)
    );
  };
  
  const handleResetView = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(750).call(
      d3.zoom().transform as any,
      d3.zoomIdentity
    );
  };
  
  return (
    <Card className={`glass-card ${expanded ? 'h-[600px]' : 'h-[300px]'} transition-all duration-300 ease-in-out animate-fade-in`}>
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <CardTitle className="text-lg">Transaction Flow Analysis</CardTitle>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleZoomIn}
            className="h-7 w-7"
          >
            <ZoomIn size={14} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleZoomOut}
            className="h-7 w-7"
          >
            <ZoomOut size={14} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleResetView}
            className="h-7 w-7"
          >
            <RefreshCw size={14} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggleExpand}
            className="h-7 w-7"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-full overflow-hidden">
        {nodes.length > 0 ? (
          <div className="relative w-full h-full">
            <svg 
              ref={svgRef} 
              width="100%" 
              height="100%" 
              className={`cursor-${isDragging ? 'grabbing' : 'grab'}`}
            ></svg>
            <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm text-xs px-2 py-1 rounded-sm">
              Zoom: {Math.round(zoom * 100)}%
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No transaction data to visualize</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TransactionFlow;
