export type ConversationState = 'IDLE' | 'GREETING' | 'CONNECTING' | 'LISTENING' | 'SPEAKING' | 'DISCONNECTING';
export type ConversationEvent = 'greet' | 'connect' | 'ready' | 'speaking' | 'listening' | 'stop' | 'closed';
export function conversationTransition(state: ConversationState, event: ConversationEvent): ConversationState {
  if (event === 'stop') return state === 'IDLE' ? 'IDLE' : 'DISCONNECTING';
  if (event === 'closed') return 'IDLE';
  const transitions: Partial<Record<ConversationState, Partial<Record<ConversationEvent, ConversationState>>>> = {
    IDLE: {greet:'GREETING',connect:'CONNECTING'}, GREETING:{connect:'CONNECTING'},
    CONNECTING:{ready:'LISTENING'}, LISTENING:{speaking:'SPEAKING'}, SPEAKING:{listening:'LISTENING'},
  };
  return transitions[state]?.[event] ?? state;
}
export function hasPremium(status: string): boolean { return status === 'active' || status === 'trialing'; }
export type NeedCandidate = { title: string; description: string };
export function detectNeeds(text: string): NeedCandidate[] {
  // Deterministic fallback, never stores input. Candidates are suggestions, not facts.
  const rules: [RegExp, NeedCandidate][] = [
    [/電球.*(切れ|交換)|明かり.*(つかない|点かない)/, {title:'電球の交換',description:'電球の交換を手伝ってほしい。'}],
    [/部屋.*寒|暖房.*(壊|つかない)/, {title:'部屋の寒さ',description:'部屋を暖かくする方法を相談したい。'}],
    [/靴.*(欲し|ほし|新し)/, {title:'靴の購入',description:'新しい靴を選ぶ手伝いをお願いしたい。'}],
    [/買い物.*(行きづら|行けない|困|大変)/, {title:'買い物の手助け',description:'買い物の手助けについて相談したい。'}],
  ];
  if (text.length > 4000) return [];
  return rules.filter(([pattern]) => pattern.test(text)).map(([,candidate]) => ({...candidate}));
}
export function canReadNeed(ownerId: string, viewerId: string, shared: boolean, permitted: boolean, expiresAt: number, now = Date.now()): boolean {
  return expiresAt > now && (ownerId === viewerId || (shared && permitted));
}
