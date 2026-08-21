import type { DemandType } from "@/types/domain";

export function supportsQuestionDashboard(type: DemandType) {
  return type === "lista" || type === "exercicio";
}
