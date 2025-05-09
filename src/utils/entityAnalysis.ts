import { EnrichedTransaction, EntityType, EntityPattern } from '@/types';
import { getEnhancedTransactionDetails } from './heliusApi';

interface EntityAnalysis {
    address: string;
    type: EntityType;
    patterns: EntityPattern[];
    riskScore: number;
    associatedAddresses: string[];
    transactionCount: number;
    totalVolume: number;
    firstSeen: number;
    lastSeen: number;
}

const ENTITY_PATTERNS = {
    DEX: {
        keywords: ['swap', 'exchange', 'liquidity', 'pool'],
        programs: ['JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'],
        minTransactions: 10
    },
    NFT_MARKETPLACE: {
        keywords: ['nft', 'mint', 'auction', 'bid'],
        programs: ['M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K', 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk'],
        minTransactions: 5
    },
    GAMING: {
        keywords: ['game', 'play', 'reward', 'level'],
        programs: ['GAMEFiQvN1VGoy8v1H3i9STtVfqqzRd6BnhFCTmJwz9', 'GAMEKqXzGJ4tG4F8z4L4tG4F8z4L4tG4F8z4L4tG4F8z4'],
        minTransactions: 15
    },
    DEFI: {
        keywords: ['stake', 'yield', 'farm', 'lend', 'borrow'],
        programs: ['Stake11111111111111111111111111111111111111', 'Lend11111111111111111111111111111111111111'],
        minTransactions: 20
    }
};

export async function analyzeEntity(address: string, transactions: EnrichedTransaction[]): Promise<EntityAnalysis> {
    const analysis: EntityAnalysis = {
        address,
        type: 'UNKNOWN',
        patterns: [],
        riskScore: 0,
        associatedAddresses: [],
        transactionCount: transactions.length,
        totalVolume: 0,
        firstSeen: Infinity,
        lastSeen: 0
    };

    // Calculate basic metrics
    for (const tx of transactions) {
        if (tx.blockTime) {
            analysis.firstSeen = Math.min(analysis.firstSeen, tx.blockTime);
            analysis.lastSeen = Math.max(analysis.lastSeen, tx.blockTime);
        }
        if (tx.parsedInfo?.amount) {
            analysis.totalVolume += tx.parsedInfo.amount;
        }
    }

    // Detect patterns
    const patterns = detectPatterns(transactions);
    analysis.patterns = patterns;

    // Determine entity type based on patterns
    analysis.type = determineEntityType(patterns);

    // Calculate risk score
    analysis.riskScore = calculateEntityRiskScore(analysis);

    // Find associated addresses
    analysis.associatedAddresses = findAssociatedAddresses(transactions);

    return analysis;
}

function detectPatterns(transactions: EnrichedTransaction[]): EntityPattern[] {
    const patterns: EntityPattern[] = [];
    const programInteractions = new Map<string, number>();
    const tokenInteractions = new Map<string, number>();
    const timePatterns = new Map<number, number>();

    for (const tx of transactions) {
        // Track program interactions
        if (tx.parsedInfo?.programId) {
            programInteractions.set(
                tx.parsedInfo.programId,
                (programInteractions.get(tx.parsedInfo.programId) || 0) + 1
            );
        }

        // Track token interactions
        if (tx.parsedInfo?.rawData?.tokenTransfers) {
            for (const transfer of tx.parsedInfo.rawData.tokenTransfers) {
                tokenInteractions.set(
                    transfer.mint,
                    (tokenInteractions.get(transfer.mint) || 0) + 1
                );
            }
        }

        // Track time patterns
        if (tx.blockTime) {
            const hour = new Date(tx.blockTime * 1000).getHours();
            timePatterns.set(hour, (timePatterns.get(hour) || 0) + 1);
        }
    }

    // Detect program-based patterns
    for (const [programId, count] of programInteractions) {
        for (const [entityType, pattern] of Object.entries(ENTITY_PATTERNS)) {
            if (pattern.programs.includes(programId) && count >= pattern.minTransactions) {
                patterns.push({
                    type: entityType as EntityType,
                    confidence: Math.min(count / pattern.minTransactions, 1),
                    evidence: [`Interacted with ${entityType} program ${count} times`]
                });
            }
        }
    }

    // Detect token-based patterns
    for (const [mint, count] of tokenInteractions) {
        if (count >= 5) {
            patterns.push({
                type: 'TOKEN_HOLDER',
                confidence: Math.min(count / 10, 1),
                evidence: [`Holds token ${mint} with ${count} interactions`]
            });
        }
    }

    // Detect time-based patterns
    const activeHours = Array.from(timePatterns.entries())
        .filter(([_, count]) => count >= 3)
        .map(([hour]) => hour);

    if (activeHours.length >= 3) {
        patterns.push({
            type: 'ACTIVE_TRADER',
            confidence: Math.min(activeHours.length / 24, 1),
            evidence: [`Active during hours: ${activeHours.join(', ')}`]
        });
    }

    return patterns;
}

function determineEntityType(patterns: EntityPattern[]): EntityType {
    const typeScores = new Map<EntityType, number>();

    for (const pattern of patterns) {
        typeScores.set(
            pattern.type,
            (typeScores.get(pattern.type) || 0) + pattern.confidence
        );
    }

    let maxScore = 0;
    let determinedType: EntityType = 'UNKNOWN';

    for (const [type, score] of typeScores) {
        if (score > maxScore) {
            maxScore = score;
            determinedType = type;
        }
    }

    return determinedType;
}

function calculateEntityRiskScore(analysis: EntityAnalysis): number {
    let riskScore = 0;

    // Volume-based risk
    if (analysis.totalVolume > 1000) {
        riskScore += 20;
    } else if (analysis.totalVolume > 100) {
        riskScore += 10;
    }

    // Transaction frequency risk
    const timeSpan = analysis.lastSeen - analysis.firstSeen;
    const transactionsPerDay = analysis.transactionCount / (timeSpan / (24 * 60 * 60));
    if (transactionsPerDay > 50) {
        riskScore += 20;
    } else if (transactionsPerDay > 20) {
        riskScore += 10;
    }

    // Pattern-based risk
    for (const pattern of analysis.patterns) {
        if (pattern.type === 'HIGH_RISK') {
            riskScore += 30;
        } else if (pattern.type === 'MEDIUM_RISK') {
            riskScore += 15;
        }
    }

    // Associated addresses risk
    if (analysis.associatedAddresses.length > 50) {
        riskScore += 20;
    } else if (analysis.associatedAddresses.length > 20) {
        riskScore += 10;
    }

    return Math.min(riskScore, 100);
}

function findAssociatedAddresses(transactions: EnrichedTransaction[]): string[] {
    const addresses = new Set<string>();

    for (const tx of transactions) {
        if (tx.parsedInfo?.sender) {
            addresses.add(tx.parsedInfo.sender);
        }
        if (tx.parsedInfo?.receiver) {
            addresses.add(tx.parsedInfo.receiver);
        }
    }

    return Array.from(addresses);
} 