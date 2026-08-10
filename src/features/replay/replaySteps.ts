import type { Card } from "../../ApiType";
import type {
  AiReplayDecision,
  AiReplayHand,
  ReplayStreet,
} from "../../shared/aiReplay";

export type ReplayStepKind = "deal" | "act" | "street" | "settle";
export type ReplayStepStreet = ReplayStreet | "result";

export interface ReplaySeatView {
  id: string;
  remaining: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  action?: string;
  actionAmount?: number;
  winner?: boolean;
  profit?: number;
  showdown?: boolean;
}

export interface ReplayStep {
  kind: ReplayStepKind;
  street: ReplayStepStreet;
  board: Card[];
  newCardCount: number;
  pot: number;
  seats: Record<string, ReplaySeatView>;
  actorId?: string;
  decision?: AiReplayDecision;
  heroDecisionIndex?: number;
  wonPot?: number;
}

function seatsFromContext(
  decision: AiReplayDecision,
  streetActions: Record<string, { action: string; amount?: number }>
): Record<string, ReplaySeatView> {
  const seats: Record<string, ReplaySeatView> = {};
  decision.context.players.forEach((player) => {
    const recorded = streetActions[player.id];
    seats[player.id] = {
      id: player.id,
      remaining: player.remaining,
      streetBet: player.streetBet,
      folded: player.folded,
      allIn: player.allIn,
      action: recorded?.action,
      actionAmount: recorded?.amount,
    };
  });
  return seats;
}

/**
 * Expands a persisted replay into linear playback steps. Each decision's
 * context snapshot is the authoritative pre-action state; the actual action
 * is applied on top of it so every step shows the table *after* the action.
 */
export function buildReplaySteps(replay: AiReplayHand): ReplayStep[] {
  const steps: ReplayStep[] = [];
  const decisions = [...replay.decisions].sort((a, b) => a.sequence - b.sequence);
  let streetActions: Record<string, { action: string; amount?: number }> = {};
  let heroDecisionCount = 0;
  let shownBoardCount = 0;

  decisions.forEach((decision, index) => {
    const context = decision.context;
    if (index === 0) {
      steps.push({
        kind: "deal",
        street: decision.street,
        board: context.board,
        newCardCount: 0,
        pot: context.potBefore,
        seats: seatsFromContext(decision, streetActions),
      });
      shownBoardCount = context.board.length;
    } else if (decision.street !== decisions[index - 1].street) {
      streetActions = {};
      steps.push({
        kind: "street",
        street: decision.street,
        board: context.board,
        newCardCount: Math.max(0, context.board.length - shownBoardCount),
        pot: context.potBefore,
        seats: seatsFromContext(decision, streetActions),
      });
      shownBoardCount = context.board.length;
    }

    const actual = decision.actual;
    streetActions[decision.actorId] = {
      action: actual.action,
      amount: actual.amountTo,
    };
    const seats = seatsFromContext(decision, streetActions);
    const actorSeat = seats[decision.actorId];
    if (actorSeat) {
      if (actual.action === "fold") {
        actorSeat.folded = true;
      } else {
        if (actual.amountTo !== undefined) actorSeat.streetBet = actual.amountTo;
        actorSeat.remaining = Math.max(0, actorSeat.remaining - (actual.delta ?? 0));
        if (actual.action === "allin" || actorSeat.remaining <= 0) actorSeat.allIn = true;
      }
    }
    if (decision.actorType === "human") heroDecisionCount += 1;
    steps.push({
      kind: "act",
      street: decision.street,
      board: context.board,
      newCardCount: 0,
      pot: context.potBefore + (actual.delta ?? 0),
      seats,
      actorId: decision.actorId,
      decision,
      heroDecisionIndex: decision.actorType === "human" ? heroDecisionCount : undefined,
    });
  });

  const finalBoard = replay.runouts[0]?.board?.length
    ? replay.runouts[0].board
    : replay.board;
  const settlementByParticipant: Record<string, { profit: number; winner: boolean; folded: boolean }> = {};
  replay.runouts.forEach((runout) => {
    runout.players.forEach((player) => {
      const entry = settlementByParticipant[player.participantId] || {
        profit: 0,
        winner: false,
        folded: player.folded,
      };
      entry.profit += player.profit;
      entry.winner = entry.winner || player.winner;
      entry.folded = entry.folded && player.folded;
      settlementByParticipant[player.participantId] = entry;
    });
  });
  const settleSeats: Record<string, ReplaySeatView> = {};
  replay.participants.forEach((participant) => {
    const settlement = settlementByParticipant[participant.id];
    settleSeats[participant.id] = {
      id: participant.id,
      remaining: participant.endingStack ??
        participant.startingStack + (settlement?.profit ?? 0),
      streetBet: 0,
      folded: settlement?.folded ?? false,
      allIn: false,
      winner: settlement?.winner ?? false,
      profit: settlement?.profit,
      showdown: settlement ? !settlement.folded : false,
    };
  });
  const lastPot = steps.length ? steps[steps.length - 1].pot : 0;
  steps.push({
    kind: "settle",
    street: "result",
    board: finalBoard,
    newCardCount: Math.max(0, finalBoard.length - shownBoardCount),
    pot: 0,
    seats: settleSeats,
    wonPot: lastPot,
  });
  return steps;
}
