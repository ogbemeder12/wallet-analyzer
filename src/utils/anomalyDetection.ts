import { EnrichedTransaction, AnomalyDetectionResult } from '@/types';

interface TransactionMetrics {
    amount: number;
    timestamp: number;
    programId: string;
    sender: string;
    receiver: string;
}

interface AnomalyPattern {
    type: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    detect: (metrics: TransactionMetrics[], currentTx: TransactionMetrics) => boolean;
}

const ANOMALY_PATTERNS: AnomalyPattern[] = [
    {
        type: 'UNUSUAL_AMOUNT',
        description: 'Transaction amount significantly different from historical average',
        severity: 'MEDIUM',
        detect: (metrics, currentTx) => {
            if (metrics.length < 5) return false;

            const amounts = metrics.map(m => m.amount);
            const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
            const stdDev = Math.sqrt(
                amounts.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / amounts.length
            );

            return Math.abs(currentTx.amount - mean) > 3 * stdDev;
        }
    },
    {
        type: 'RAPID_TRANSACTIONS',
        description: 'Multiple transactions in a short time period',
        severity: 'HIGH',
        detect: (metrics, currentTx) => {
            const recentTxs = metrics.filter(m =>
                currentTx.timestamp - m.timestamp < 300 // 5 minutes
            );
            return recentTxs.length >= 5;
        }
    },
    {
        type: 'UNUSUAL_PROGRAM',
        description: 'Transaction using a program not seen in recent history',
        severity: 'MEDIUM',
        detect: (metrics, currentTx) => {
            if (metrics.length < 10) return false;

            const recentPrograms = new Set(
                metrics.slice(-10).map(m => m.programId)
            );
            return !recentPrograms.has(currentTx.programId);
        }
    },
    {
        type: 'NEW_COUNTERPARTY',
        description: 'Transaction with a new counterparty',
        severity: 'LOW',
        detect: (metrics, currentTx) => {
            if (metrics.length < 5) return false;

            const recentCounterparties = new Set(
                metrics.slice(-5).flatMap(m => [m.sender, m.receiver])
            );
            return !recentCounterparties.has(currentTx.sender) ||
                !recentCounterparties.has(currentTx.receiver);
        }
    },
    {
        type: 'LARGE_VALUE_TRANSFER',
        description: 'Transaction with unusually large value',
        severity: 'HIGH',
        detect: (metrics, currentTx) => {
            if (metrics.length < 3) return false;

            const maxAmount = Math.max(...metrics.map(m => m.amount));
            return currentTx.amount > maxAmount * 10;
        }
    }
];

export function detectAnomalies(transactions: EnrichedTransaction[]): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];
    const metrics: TransactionMetrics[] = [];

    // Convert transactions to metrics
    for (const tx of transactions) {
        if (!tx.blockTime || !tx.parsedInfo) continue;

        const metric: TransactionMetrics = {
            amount: tx.parsedInfo.amount || 0,
            timestamp: tx.blockTime,
            programId: tx.parsedInfo.programId || '',
            sender: tx.parsedInfo.sender || '',
            receiver: tx.parsedInfo.receiver || ''
        };

        metrics.push(metric);

        // Check for anomalies
        for (const pattern of ANOMALY_PATTERNS) {
            if (pattern.detect(metrics.slice(0, -1), metric)) {
                anomalies.push({
                    transactionSignature: tx.signature,
                    type: pattern.type,
                    description: pattern.description,
                    severity: pattern.severity,
                    timestamp: tx.blockTime,
                    details: {
                        amount: metric.amount,
                        programId: metric.programId,
                        sender: metric.sender,
                        receiver: metric.receiver
                    }
                });
            }
        }
    }

    return anomalies;
}

export function calculateAnomalyScore(anomalies: AnomalyDetectionResult[]): number {
    const severityWeights = {
        LOW: 1,
        MEDIUM: 2,
        HIGH: 3
    };

    const totalWeight = anomalies.reduce((sum, anomaly) =>
        sum + severityWeights[anomaly.severity], 0
    );

    return Math.min(totalWeight * 10, 100);
}

export function getAnomalyRecommendations(anomalies: AnomalyDetectionResult[]): string[] {
    const recommendations: string[] = [];
    const anomalyTypes = new Set(anomalies.map(a => a.type));

    if (anomalyTypes.has('UNUSUAL_AMOUNT')) {
        recommendations.push('Review transactions with unusual amounts for potential errors or fraud');
    }
    if (anomalyTypes.has('RAPID_TRANSACTIONS')) {
        recommendations.push('Investigate rapid transaction patterns for potential automated trading or manipulation');
    }
    if (anomalyTypes.has('UNUSUAL_PROGRAM')) {
        recommendations.push('Verify transactions using new or unusual programs');
    }
    if (anomalyTypes.has('NEW_COUNTERPARTY')) {
        recommendations.push('Review transactions with new counterparties for legitimacy');
    }
    if (anomalyTypes.has('LARGE_VALUE_TRANSFER')) {
        recommendations.push('Double-check large value transfers for accuracy and authorization');
    }

    return recommendations;
} 