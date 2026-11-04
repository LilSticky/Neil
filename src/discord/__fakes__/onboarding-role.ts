import type { MemberId } from "../../domain/rank-approval.js";
import type { OnboardingRole } from "../onboarding-role.js";

/** One call to the Onboarding Role service: the change asked for, and the Member it was asked for. */
export type OnboardingRoleCall =
  | { readonly kind: "give"; readonly memberId: MemberId }
  | { readonly kind: "takeOff"; readonly memberId: MemberId }
  | { readonly kind: "atStartup" };

/**
 * The Onboarding Role service as the Interview, the Officer Link and Unlink reach it: records every call. `onCall` runs
 * after the call is recorded, so a test can read the state the caller has reached when it asks for the change. The
 * service itself is tested in onboarding-role.test.ts.
 */
export class FakeOnboardingRole implements OnboardingRole {
  readonly calls: OnboardingRoleCall[] = [];
  onCall: ((call: OnboardingRoleCall) => void) | undefined = undefined;

  give(memberId: MemberId): Promise<void> {
    return this.record({ kind: "give", memberId });
  }

  takeOff(memberId: MemberId): Promise<void> {
    return this.record({ kind: "takeOff", memberId });
  }

  atStartup(): Promise<void> {
    return this.record({ kind: "atStartup" });
  }

  private record(call: OnboardingRoleCall): Promise<void> {
    this.calls.push(call);
    this.onCall?.(call);
    return Promise.resolve();
  }
}
