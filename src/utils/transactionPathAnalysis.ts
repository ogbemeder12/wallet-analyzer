import { EnrichedTransaction, TransactionPath } from '@/types';

interface TransactionNode {
    address: string;
    type: 'wallet' | 'program' | 'token';
    transactions: Set<string>;
    incoming: Map<string, number>;
    outgoing: Map<string, number>;
}

interface TransactionGraph {
    nodes: Map<string, TransactionNode>;
    edges: Map<string, Set<string>>;
}

export function analyzeTransactionPaths(transactions: EnrichedTransaction[]): TransactionPath[] {
    const graph = buildTransactionGraph(transactions);
    const paths: TransactionPath[] = [];

    // Find all paths between nodes
    for (const [address, node] of graph.nodes) {
        if (node.type === 'wallet') {
            const nodePaths = findPathsFromNode(graph, address);
            paths.push(...nodePaths);
        }
    }

    // Sort paths by significance
    return paths.sort((a, b) => b.significance - a.significance);
}

function buildTransactionGraph(transactions: EnrichedTransaction[]): TransactionGraph {
    const graph: TransactionGraph = {
        nodes: new Map(),
        edges: new Map()
    };

    for (const tx of transactions) {
        if (!tx.parsedInfo) continue;

        // Add sender node
        if (tx.parsedInfo.sender) {
            addNodeToGraph(graph, tx.parsedInfo.sender, 'wallet');
            addTransactionToNode(graph, tx.parsedInfo.sender, tx.signature);
        }

        // Add receiver node
        if (tx.parsedInfo.receiver) {
            addNodeToGraph(graph, tx.parsedInfo.receiver, 'wallet');
            addTransactionToNode(graph, tx.parsedInfo.receiver, tx.signature);
        }

        // Add program node
        if (tx.parsedInfo.programId) {
            addNodeToGraph(graph, tx.parsedInfo.programId, 'program');
            addTransactionToNode(graph, tx.parsedInfo.programId, tx.signature);
        }

        // Add token nodes and edges
        if (tx.parsedInfo.rawData?.tokenTransfers) {
            for (const transfer of tx.parsedInfo.rawData.tokenTransfers) {
                addNodeToGraph(graph, transfer.mint, 'token');
                addTransactionToNode(graph, transfer.mint, tx.signature);
            }
        }

        // Add edges
        if (tx.parsedInfo.sender && tx.parsedInfo.receiver) {
            addEdgeToGraph(graph, tx.parsedInfo.sender, tx.parsedInfo.receiver);
        }
    }

    return graph;
}

function addNodeToGraph(graph: TransactionGraph, address: string, type: 'wallet' | 'program' | 'token') {
    if (!graph.nodes.has(address)) {
        graph.nodes.set(address, {
            address,
            type,
            transactions: new Set(),
            incoming: new Map(),
            outgoing: new Map()
        });
    }
}

function addTransactionToNode(graph: TransactionGraph, address: string, signature: string) {
    const node = graph.nodes.get(address);
    if (node) {
        node.transactions.add(signature);
    }
}

function addEdgeToGraph(graph: TransactionGraph, from: string, to: string) {
    if (!graph.edges.has(from)) {
        graph.edges.set(from, new Set());
    }
    graph.edges.get(from)!.add(to);

    // Update node metrics
    const fromNode = graph.nodes.get(from);
    const toNode = graph.nodes.get(to);

    if (fromNode && toNode) {
        fromNode.outgoing.set(to, (fromNode.outgoing.get(to) || 0) + 1);
        toNode.incoming.set(from, (toNode.incoming.get(from) || 0) + 1);
    }
}

function findPathsFromNode(graph: TransactionGraph, startAddress: string): TransactionPath[] {
    const paths: TransactionPath[] = [];
    const visited = new Set<string>();
    const maxDepth = 3;

    function dfs(current: string, path: string[], depth: number) {
        if (depth > maxDepth || visited.has(current)) return;

        visited.add(current);
        path.push(current);

        // Calculate path significance
        if (path.length > 1) {
            const significance = calculatePathSignificance(graph, path);
            if (significance > 0.1) { // Only include significant paths
                paths.push({
                    addresses: [...path],
                    transactions: getPathTransactions(graph, path),
                    significance,
                    type: determinePathType(graph, path)
                });
            }
        }

        // Continue DFS
        const edges = graph.edges.get(current);
        if (edges) {
            for (const next of edges) {
                dfs(next, path, depth + 1);
            }
        }

        path.pop();
        visited.delete(current);
    }

    dfs(startAddress, [], 0);
    return paths;
}

function calculatePathSignificance(graph: TransactionGraph, path: string[]): number {
    let significance = 0;

    // Calculate based on transaction volume
    const transactions = getPathTransactions(graph, path);
    significance += transactions.size * 0.1;

    // Calculate based on node types
    for (const address of path) {
        const node = graph.nodes.get(address);
        if (node) {
            switch (node.type) {
                case 'program':
                    significance += 0.3;
                    break;
                case 'token':
                    significance += 0.2;
                    break;
                case 'wallet':
                    significance += 0.1;
                    break;
            }
        }
    }

    // Calculate based on connection strength
    for (let i = 0; i < path.length - 1; i++) {
        const from = graph.nodes.get(path[i]);
        const to = graph.nodes.get(path[i + 1]);
        if (from && to) {
            const outgoing = from.outgoing.get(path[i + 1]) || 0;
            const incoming = to.incoming.get(path[i]) || 0;
            significance += (outgoing + incoming) * 0.05;
        }
    }

    return Math.min(significance, 1);
}

function getPathTransactions(graph: TransactionGraph, path: string[]): Set<string> {
    const transactions = new Set<string>();

    for (const address of path) {
        const node = graph.nodes.get(address);
        if (node) {
            node.transactions.forEach(tx => transactions.add(tx));
        }
    }

    return transactions;
}

function determinePathType(graph: TransactionGraph, path: string[]): string {
    const types = path.map(address => graph.nodes.get(address)?.type || 'unknown');

    if (types.includes('program')) {
        return 'PROGRAM_INTERACTION';
    } else if (types.includes('token')) {
        return 'TOKEN_FLOW';
    } else if (types.length >= 3) {
        return 'COMPLEX_FLOW';
    } else {
        return 'DIRECT_TRANSFER';
    }
} 