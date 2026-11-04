import type { MemberId } from "../../domain/rank-approval.js";
import type { DoctorRole } from "../doctor-role.js";

/** One call to the Doctor Role service: the change asked for, and the Member it was asked for. */
export type DoctorRoleCall =
  | { readonly kind: "give"; readonly memberId: MemberId }
  | { readonly kind: "takeOff"; readonly memberId: MemberId }
  | { readonly kind: "atStartup" };

/**
 * The Doctor Role service as the Interview, the Officer Link and Unlink reach it: records every call. `onCall` runs after
 * the call is recorded, so a test can read the state the caller has reached when it asks for the change. The service
 * itself is tested in doctor-role.test.ts.
 */
export class FakeDoctorRole implements DoctorRole {
  readonly calls: DoctorRoleCall[] = [];
  onCall: ((call: DoctorRoleCall) => void) | undefined = undefined;

  give(memberId: MemberId): Promise<void> {
    return this.record({ kind: "give", memberId });
  }

  takeOff(memberId: MemberId): Promise<void> {
    return this.record({ kind: "takeOff", memberId });
  }

  atStartup(): Promise<void> {
    return this.record({ kind: "atStartup" });
  }

  private record(call: DoctorRoleCall): Promise<void> {
    this.calls.push(call);
    this.onCall?.(call);
    return Promise.resolve();
  }
}
