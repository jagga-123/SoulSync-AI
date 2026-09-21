/** The subset of a user + profile that's safe to expose to other users
 * (no email, no role) — used by discover, likes, and matches responses. */
export interface PublicProfile {
  id: string;
  fullName: string;
  age: number;
  city: string;
  bio: string;
  interests: string[];
  relationshipGoal: string;
  profileImage?: string;
}
