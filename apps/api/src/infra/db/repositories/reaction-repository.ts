import type { ReactionRepository } from '@/ports/repositories/namecards';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

const NAMECARD_COMPAT_ORIGIN = "origin IN ('guest', 'legacy')";

export class SqlReactionRepository implements ReactionRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    findApprovedCard(id: number): Promise<{ id: number } | null> {
        return queryOne(
            this.database,
            `SELECT card_number AS id FROM fudaba_cards
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='published' AND deleted_at IS NULL`,
            [id],
        );
    }

    listReactions(
        cardId: number,
    ): Promise<Array<{ emoji: string; count: number }>> {
        return queryAll(
            this.database,
            `SELECT reaction.emoji, reaction.count
             FROM namecard_reactions reaction
             JOIN fudaba_cards card ON card.id=reaction.card_id
             WHERE card.card_number=?
             ORDER BY reaction.count DESC`,
            [cardId],
        );
    }

    async incrementReaction(cardId: number, emoji: string): Promise<void> {
        await executeSql(
            this.database,
            `INSERT INTO namecard_reactions (card_id, emoji, count)
             SELECT id, ?, 1 FROM fudaba_cards WHERE card_number=?
             ON CONFLICT(card_id, emoji) DO UPDATE SET count=namecard_reactions.count+1`,
            [emoji, cardId],
        );
    }

    async decrementAndPruneReaction(
        cardId: number,
        emoji: string,
    ): Promise<void> {
        await this.database.batch([
            sqlStatement(
                this.database,
                `UPDATE namecard_reactions SET count=count-1
                 WHERE emoji=? AND count>0
                   AND card_id=(SELECT id FROM fudaba_cards WHERE card_number=?)`,
                [emoji, cardId],
            ),
            sqlStatement(
                this.database,
                `DELETE FROM namecard_reactions WHERE emoji=? AND count<=0
                   AND card_id=(SELECT id FROM fudaba_cards WHERE card_number=?)`,
                [emoji, cardId],
            ),
        ]);
    }
}
