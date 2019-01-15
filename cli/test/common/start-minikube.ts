import { minikubeMocha } from "@usys/testutils";

// This runs one shared instance of minikube that starts before the first
// cloud test and stops after all tests are done.
export const mkInstance = minikubeMocha.all();
