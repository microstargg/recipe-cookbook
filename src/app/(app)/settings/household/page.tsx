import { getHouseholdOverview } from "@/actions/household";
import { HouseholdSettings } from "@/components/household-settings";

export default async function HouseholdPage() {
  const overview = await getHouseholdOverview();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Household</h1>
      <p className="mt-1 text-stone-600">
        Everyone here shares the same recipes, meal plans and shopping lists.
      </p>
      <HouseholdSettings
        householdName={overview.householdName}
        defaultPortions={overview.defaultPortions}
        role={overview.role}
        currentUserId={overview.userId}
        members={overview.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          label: m.name ?? m.email ?? "Member",
          email: m.name ? m.email : null,
          role: m.role,
        }))}
        invites={overview.invites.map((i) => ({
          id: i.id,
          token: i.token,
          expiresLabel: i.expiresAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
        }))}
      />
    </div>
  );
}
