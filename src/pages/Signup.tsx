import { Navigate } from "react-router";

/** Public signup is closed — accounts are invite-only. */
export default function Signup() {
  return <Navigate to="/login" replace />;
}
