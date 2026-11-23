import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClubSyncSignature,
  mergeClubSessions,
  mergeClubUsers,
  type SessionSyncLike,
  type UserSyncLike,
} from './clubSyncMerge';

test('mergeClubUsers preserves friend registered on Phone B when stale Phone A pushes', () => {
  const cloudAfterFriendReg: UserSyncLike[] = [
    { id: 'u-super-jack', username: 'Jack', role: 'super_admin', displayName: 'Jack', createdAt: 1000 },
    { id: 'u-friend-1', username: 'xiaoyu', role: 'member', displayName: '林小宇', createdAt: 5000, updatedAt: 5000 },
  ];
  // Phone A still only has Jack locally and pushes PUT
  const stalePhoneA: UserSyncLike[] = [
    { id: 'u-super-jack', username: 'Jack', role: 'super_admin', displayName: 'Jack', createdAt: 1000 },
  ];

  const merged = mergeClubUsers(cloudAfterFriendReg, stalePhoneA);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((u) => u.username === 'xiaoyu' && u.displayName === '林小宇'));
});

test('mergeClubUsers respects newer updatedAt so stale phone never downgrades admin role', () => {
  const cloudPromoted: UserSyncLike[] = [
    { id: 'u-friend-1', username: 'xiaoyu', role: 'admin', displayName: '林小宇', createdAt: 5000, updatedAt: 9000 },
  ];
  const stalePhoneB: UserSyncLike[] = [
    { id: 'u-friend-1', username: 'xiaoyu', role: 'member', displayName: '林小宇', createdAt: 5000, updatedAt: 5000 },
  ];

  const merged = mergeClubUsers(cloudPromoted, stalePhoneB);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].role, 'admin');
  assert.equal(merged[0].updatedAt, 9000);
});

test('mergeClubUsers deduplicates same case-insensitive username and preserves avatar & super_admin', () => {
  const existing: UserSyncLike[] = [
    { id: 'u-super-jack', username: 'Jack', role: 'super_admin', avatarUrl: 'data:image/png;base64,abc', createdAt: 1000 },
  ];
  const incoming: UserSyncLike[] = [
    { id: 'u-jack-dup', username: 'jack', role: 'member', createdAt: 2000, updatedAt: 2000 },
  ];

  const merged = mergeClubUsers(existing, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].role, 'super_admin');
  assert.equal(merged[0].avatarUrl, 'data:image/png;base64,abc');
});

test('mergeClubSessions preserves simultaneous scores entered on Court 1 and Court 2', () => {
  const phoneA: SessionSyncLike[] = [
    {
      id: 'sess-1',
      sessionDate: '2026-06-01',
      updatedAt: 2000,
      rounds: [
        {
          roundNumber: 1,
          matches: [
            { id: 'm-c1', status: 'completed', scoreA: 11, scoreB: 7, completedAt: 2000 },
            { id: 'm-c2', status: 'pending', scoreA: null, scoreB: null },
          ],
        },
      ],
    },
  ];
  const phoneB: SessionSyncLike[] = [
    {
      id: 'sess-1',
      sessionDate: '2026-06-01',
      updatedAt: 2100,
      rounds: [
        {
          roundNumber: 1,
          matches: [
            { id: 'm-c1', status: 'pending', scoreA: null, scoreB: null },
            { id: 'm-c2', status: 'completed', scoreA: 11, scoreB: 9, completedAt: 2100 },
          ],
        },
      ],
    },
  ];

  const merged = mergeClubSessions(phoneA, phoneB);
  assert.equal(merged.length, 1);
  const matches = merged[0].rounds?.[0]?.matches ?? [];
  assert.equal(matches[0].status, 'completed');
  assert.equal(matches[0].scoreA, 11);
  assert.equal(matches[0].scoreB, 7);
  assert.equal(matches[1].status, 'completed');
  assert.equal(matches[1].scoreA, 11);
  assert.equal(matches[1].scoreB, 9);
});

test('computeClubSyncSignature is order-independent and detects new registrations', () => {
  const u1: UserSyncLike = { id: 'a', username: 'jack', role: 'super_admin', createdAt: 100 };
  const u2: UserSyncLike = { id: 'b', username: 'leo', role: 'member', createdAt: 200 };

  const sig1 = computeClubSyncSignature([u1, u2], []);
  const sig2 = computeClubSyncSignature([u2, u1], []);
  const sigOnlyOne = computeClubSyncSignature([u1], []);

  assert.equal(sig1, sig2);
  assert.notEqual(sig1, sigOnlyOne);
});
