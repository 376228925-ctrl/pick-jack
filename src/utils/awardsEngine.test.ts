import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTournamentAwards, getPlayerHonorProfile } from './awardsEngine';
import { calculateStandings } from './scheduler';
import { createInitialCalendarSessions } from './sessionArchive';

test('computeTournamentAwards produces MVP, Best Duo, and personalized honors from completed matches', () => {
  const sessions = createInitialCalendarSessions();
  const yesterday = sessions[1]; // Yesterday session has 4 fully completed rounds
  const standings = calculateStandings(yesterday.players, yesterday.rounds);
  const awards = computeTournamentAwards(yesterday, standings);

  assert.ok(awards.length >= 3, 'Should produce at least MVP, Best Duo, and offense/defense awards');
  assert.equal(awards[0].id, 'mvp');
  assert.equal(awards[0].playerIds[0], standings[0].player.id);
  assert.ok(awards.some((a) => a.id === 'best_duo'), 'Should identify a Best Duo pair');

  const mvpProfile = getPlayerHonorProfile(standings[0], awards);
  assert.equal(mvpProfile.primaryBadge, '全场 MVP');

  const lastPlayerProfile = getPlayerHonorProfile(standings[standings.length - 1], awards);
  assert.ok(lastPlayerProfile.primaryBadge.length > 0 && lastPlayerProfile.slogan.length > 0);
});
