import type { Metadata } from "next";
import { getWeekPlan } from "@/actions/plan";
import { WeekPlanner } from "@/components/plan/week-planner";

export const metadata: Metadata = { title: "Meal plan" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const plan = await getWeekPlan(week);
  return <WeekPlanner plan={plan} />;
}
