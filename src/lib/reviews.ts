import { formatDate } from "@/lib/date";
import { isAssessmentUpcoming } from "@/lib/grades";
import type {
  AppData,
  Assessment,
  AssessmentMaterial,
  Material,
  ReviewAction,
  ReviewDayPlan,
  ReviewEvent,
  ReviewQueueItem,
  ReviewQueueState,
  Subject,
  Topic,
  TopicMasteryLevel,
  TopicPrerequisite,
} from "@/types/domain";

export const DEFAULT_REVIEW_CAPACITY = 3;
export const REVIEW_INTERVALS: Record<Exclude<TopicMasteryLevel, 0>, number> = {
  1: 1,
  2: 3,
  3: 7,
};

export type ReviewEntry = {
  key: string;
  kind: "topic" | "material";
  title: string;
  subject: Subject;
  assessment: Assessment | null;
  mastery: TopicMasteryLevel;
  lastReviewedAt: string | null;
  nextReviewDate: string | null;
  orderIndex: number;
  topic?: Topic;
  material?: Material;
  assessmentMaterial?: AssessmentMaterial;
  prerequisites: Topic[];
  unmetPrerequisites: Topic[];
};

export type ReviewPriority = {
  score: number;
  reasons: string[];
  blocked: boolean;
};

export type ReviewActivityDay = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type ReviewScheduleChange = {
  entry: ReviewEntry;
  fromDate: string;
  toDate: string;
};

export type ReviewDayLoad = {
  date: string;
  label: string;
  shortDate: string;
  scheduled: number;
  completed: number;
  capacity: number;
};

function normalizedDate(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

export function localIsoDate(offset = 0, reference = new Date()) {
  const date = normalizedDate(reference);
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateFromTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localIsoDate(0, date);
}

function dateDifference(reference: Date, target: string) {
  const start = normalizedDate(reference).getTime();
  const end = new Date(`${target}T12:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function reviewedDaysAgo(value: string | null, reference = new Date()) {
  if (!value) return null;
  const reviewedDate = isoDateFromTimestamp(value);
  if (!reviewedDate) return null;
  return Math.max(0, -dateDifference(reference, reviewedDate));
}

export function inferredTopicMastery(topic: Topic): TopicMasteryLevel {
  if (topic.mastery_level === 0 || topic.mastery_level === 1 || topic.mastery_level === 2 || topic.mastery_level === 3) {
    return topic.mastery_level;
  }
  if (topic.status === "concluido") return 2;
  if (topic.status === "estudando") return 1;
  return 0;
}

function hasStudyProgress(item: {
  mastery_level?: TopicMasteryLevel | null;
  last_reviewed_at?: string | null;
  next_review_date?: string | null;
}) {
  return item.mastery_level !== null && item.mastery_level !== undefined
    || Boolean(item.last_reviewed_at)
    || Boolean(item.next_review_date);
}

function assessmentTime(assessment: Assessment | null) {
  if (!assessment?.date) return Number.MAX_SAFE_INTEGER;
  return new Date(`${assessment.date}T12:00:00`).getTime();
}

function nearerAssessment(current: Assessment | null, candidate: Assessment) {
  if (!current) return candidate;
  return assessmentTime(candidate) < assessmentTime(current) ? candidate : current;
}

export function buildReviewEntries({
  subjects,
  topics,
  assessments,
  assessmentTopics,
  assessmentMaterials,
  materials,
  topicPrerequisites = [],
}: Pick<AppData,
  "subjects" | "topics" | "assessments" | "assessmentTopics" | "assessmentMaterials" | "materials"
> & Partial<Pick<AppData, "topicPrerequisites">>) {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const prerequisiteIdsByTopic = new Map<string, string[]>();
  topicPrerequisites.forEach((relation: TopicPrerequisite) => {
    prerequisiteIdsByTopic.set(relation.topic_id, [
      ...(prerequisiteIdsByTopic.get(relation.topic_id) ?? []),
      relation.prerequisite_topic_id,
    ]);
  });
  const topicsBySubject = new Map<string, Topic[]>();
  topics.forEach((topic) => {
    const current = topicsBySubject.get(topic.subject_id) ?? [];
    current.push(topic);
    topicsBySubject.set(topic.subject_id, current);
  });

  const topicEntries = new Map<string, ReviewEntry>();
  topics.forEach((topic) => {
    const subject = subjectById.get(topic.subject_id);
    if (!subject) return;
    topicEntries.set(topic.id, {
      key: `topic-${topic.id}`,
      kind: "topic",
      title: topic.title,
      subject,
      assessment: null,
      mastery: inferredTopicMastery(topic),
      lastReviewedAt: topic.last_reviewed_at ?? null,
      nextReviewDate: topic.next_review_date ?? null,
      orderIndex: topic.order_index,
      topic,
      prerequisites: [],
      unmetPrerequisites: [],
    });
  });

  const upcomingAssessments = assessments
    .filter(isAssessmentUpcoming)
    .sort((a, b) => assessmentTime(a) - assessmentTime(b));

  upcomingAssessments.forEach((assessment) => {
    const linkedTopicIds = new Set(
      assessmentTopics
        .filter((item) => item.assessment_id === assessment.id)
        .map((item) => item.topic_id),
    );
    const linkedMaterials = assessmentMaterials.filter((item) => item.assessment_id === assessment.id);
    const hasExplicitScope = linkedTopicIds.size > 0 || linkedMaterials.length > 0;
    const scopedTopics = hasExplicitScope
      ? topics.filter((topic) => linkedTopicIds.has(topic.id))
      : topicsBySubject.get(assessment.subject_id) ?? [];

    scopedTopics.forEach((topic) => {
      const subject = subjectById.get(topic.subject_id);
      if (!subject) return;
      const current = topicEntries.get(topic.id);
      if (current) {
        current.assessment = nearerAssessment(current.assessment, assessment);
        return;
      }
      topicEntries.set(topic.id, {
        key: `topic-${topic.id}`,
        kind: "topic",
        title: topic.title,
        subject,
        assessment,
        mastery: inferredTopicMastery(topic),
        lastReviewedAt: topic.last_reviewed_at ?? null,
        nextReviewDate: topic.next_review_date ?? null,
        orderIndex: topic.order_index,
        topic,
        prerequisites: [],
        unmetPrerequisites: [],
      });
    });
  });

  const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const materialEntries = assessmentMaterials.flatMap<ReviewEntry>((link) => {
    const assessment = assessmentById.get(link.assessment_id) ?? null;
    if (!hasStudyProgress(link) && (!assessment || !isAssessmentUpcoming(assessment))) return [];
    const material = materialById.get(link.material_id);
    const subject = material ? subjectById.get(material.subject_id) : null;
    if (!material || !subject || (material.type === "link" && !material.url)) return [];
    return [{
      key: `material-${link.assessment_id}-${link.material_id}`,
      kind: "material",
      title: material.name,
      subject,
      assessment,
      mastery: link.mastery_level ?? 0,
      lastReviewedAt: link.last_reviewed_at ?? null,
      nextReviewDate: link.next_review_date ?? null,
      orderIndex: material.sort_order ?? Number.MAX_SAFE_INTEGER,
      material,
      assessmentMaterial: link,
      prerequisites: [],
      unmetPrerequisites: [],
    }];
  });

  const entries = [...topicEntries.values(), ...materialEntries];
  entries.forEach((entry) => {
    if (!entry.topic) return;
    entry.prerequisites = (prerequisiteIdsByTopic.get(entry.topic.id) ?? [])
      .map((id) => topicById.get(id))
      .filter((topic): topic is Topic => Boolean(topic));
    entry.unmetPrerequisites = entry.prerequisites.filter((topic) => inferredTopicMastery(topic) < 2);
  });
  return entries;
}

export function isReviewDue(entry: ReviewEntry, reference = new Date()) {
  return !entry.nextReviewDate || dateDifference(reference, entry.nextReviewDate) <= 0;
}

export function sortReviewEntries(entries: ReviewEntry[], reference = new Date()) {
  return [...entries].sort((a, b) => {
    const aPriority = reviewPriority(a, reference);
    const bPriority = reviewPriority(b, reference);
    if (aPriority.blocked !== bPriority.blocked) return aPriority.blocked ? 1 : -1;
    if (aPriority.score !== bPriority.score) return bPriority.score - aPriority.score;

    const assessmentDifference = assessmentTime(a.assessment) - assessmentTime(b.assessment);
    if (assessmentDifference !== 0) return assessmentDifference;
    if (a.subject.id !== b.subject.id) return a.subject.code.localeCompare(b.subject.code, "pt-BR");
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

export function reviewPriority(entry: ReviewEntry, reference = new Date()): ReviewPriority {
  let score = 0;
  const reasons: string[] = [];
  const scheduleDifference = entry.nextReviewDate ? dateDifference(reference, entry.nextReviewDate) : null;

  if (scheduleDifference === null) {
    score += entry.lastReviewedAt ? 22 : 34;
    reasons.push(entry.lastReviewedAt ? "Sem nova data" : "Nunca revisado");
  } else if (scheduleDifference < 0) {
    const overdueDays = Math.abs(scheduleDifference);
    score += 28 + Math.min(70, overdueDays * 5);
    reasons.push(`${overdueDays}d em atraso`);
  } else if (scheduleDifference === 0) {
    score += 27;
    reasons.push("Revisão prevista hoje");
  } else {
    score += Math.max(0, 13 - scheduleDifference);
    if (scheduleDifference <= 7) reasons.push(`Previsto em ${scheduleDifference}d`);
  }

  const masteryScore: Record<TopicMasteryLevel, number> = { 0: 32, 1: 23, 2: 11, 3: 0 };
  score += masteryScore[entry.mastery];
  if (entry.mastery === 0) reasons.push("Ainda não estudado");
  else if (entry.mastery === 1) reasons.push("Domínio frágil");

  const age = reviewedDaysAgo(entry.lastReviewedAt, reference);
  if (age === null) {
    score += 18;
  } else {
    score += Math.min(28, age * 2);
    if (age >= 7) reasons.push(`${age}d sem revisar`);
  }

  if (entry.assessment?.date) {
    const assessmentDays = dateDifference(reference, entry.assessment.date);
    if (assessmentDays <= 3) score += 42;
    else if (assessmentDays <= 7) score += 30;
    else if (assessmentDays <= 14) score += 18;
    else if (assessmentDays <= 30) score += 8;
    if (assessmentDays >= 0 && assessmentDays <= 14) reasons.push(`${entry.assessment.name} em ${assessmentDays}d`);
  }

  const blocked = entry.unmetPrerequisites.length > 0;
  if (blocked) {
    score -= 90 + entry.unmetPrerequisites.length * 10;
    reasons.push(`Antes: ${entry.unmetPrerequisites.map((topic) => topic.title).join(", ")}`);
  }

  return { score, reasons: reasons.slice(0, 3), blocked };
}

export function dueReviewEntries(entries: ReviewEntry[], reference = new Date()) {
  return sortReviewEntries(entries.filter((entry) => isReviewDue(entry, reference)), reference);
}

export function futureReviewEntries(entries: ReviewEntry[], reference = new Date()) {
  return [...entries]
    .filter((entry) => entry.nextReviewDate && dateDifference(reference, entry.nextReviewDate) > 0)
    .sort((a, b) => dateDifference(reference, a.nextReviewDate!) - dateDifference(reference, b.nextReviewDate!));
}

export function dueReason(entry: ReviewEntry, reference = new Date()) {
  if (!entry.nextReviewDate) return entry.lastReviewedAt ? "Sem nova data" : "Ainda não revisado";
  const difference = dateDifference(reference, entry.nextReviewDate);
  if (difference < 0) return `Atrasada há ${Math.abs(difference)}d`;
  if (difference > 1) return `Agendada em ${difference}d`;
  if (difference === 1) return "Agendada para amanhã";
  return "Agendada para hoje";
}

export function lastReviewText(value: string | null, reference = new Date()) {
  const days = reviewedDaysAgo(value, reference);
  if (days === null) return "Nunca revisado";
  if (days === 0) return "Revisado hoje";
  if (days === 1) return "Última revisão ontem";
  return `Última revisão há ${days}d`;
}

export function storedMastery(entry: ReviewEntry) {
  return entry.topic?.mastery_level ?? entry.assessmentMaterial?.mastery_level ?? null;
}

export function nextMasteryAfterReview(entry: ReviewEntry): Exclude<TopicMasteryLevel, 0> {
  return entry.mastery === 0 ? 1 : entry.mastery;
}

export function nextDateAfterReview(entry: ReviewEntry, reference = new Date()) {
  const mastery = nextMasteryAfterReview(entry);
  return localIsoDate(REVIEW_INTERVALS[mastery], reference);
}

export function reviewHref(entry: ReviewEntry) {
  if (entry.topic) return `/materias/${encodeURIComponent(entry.subject.id)}?aba=preparacao`;
  if (entry.material?.type === "link") return entry.material.url!;
  return `/materiais/abrir/${encodeURIComponent(entry.material!.id)}`;
}

export function reviewEventFor(
  entry: ReviewEntry,
  action: ReviewAction,
  resultingReviewDate: string | null,
  masteryLevel: TopicMasteryLevel | null,
  reference = new Date(),
): ReviewEvent {
  return {
    id: crypto.randomUUID(),
    subject_id: entry.subject.id,
    target_type: entry.kind,
    target_title: entry.title,
    topic_id: entry.topic?.id ?? null,
    assessment_id: entry.assessmentMaterial?.assessment_id ?? entry.assessment?.id ?? null,
    material_id: entry.material?.id ?? null,
    action,
    scheduled_for: entry.nextReviewDate ?? localIsoDate(0, reference),
    resulting_review_date: resultingReviewDate,
    mastery_level: masteryLevel,
    created_at: reference.toISOString(),
  };
}

export function completedReviewsOn(date: string, events: ReviewEvent[]) {
  return events.filter((event) => event.action === "completed" && isoDateFromTimestamp(event.created_at) === date).length;
}

export function reviewQueueItemFor(
  entry: ReviewEntry,
  queueDate: string,
  state: ReviewQueueState,
  sortOrder: number,
  current?: ReviewQueueItem,
): ReviewQueueItem {
  const now = new Date().toISOString();
  return {
    id: current?.id ?? crypto.randomUUID(),
    queue_date: queueDate,
    target_key: entry.key,
    target_type: entry.kind,
    subject_id: entry.subject.id,
    topic_id: entry.topic?.id ?? null,
    assessment_id: entry.assessmentMaterial?.assessment_id ?? entry.assessment?.id ?? null,
    material_id: entry.material?.id ?? null,
    state,
    sort_order: sortOrder,
    created_at: current?.created_at ?? now,
    updated_at: now,
  };
}

export function buildReviewActivity(events: ReviewEvent[], weeks = 18, reference = new Date()): ReviewActivityDay[] {
  const countByDate = new Map<string, number>();
  events.forEach((event) => {
    if (event.action !== "completed") return;
    const date = isoDateFromTimestamp(event.created_at);
    if (date) countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  });

  const end = normalizedDate(reference);
  const start = normalizedDate(reference);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset - (weeks - 1) * 7);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const paddedDays = Math.max(weeks * 7, totalDays);

  return Array.from({ length: paddedDays }, (_, index) => {
    const date = localIsoDate(index, start);
    const count = countByDate.get(date) ?? 0;
    const level: ReviewActivityDay["level"] = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
    return { date, count, level };
  });
}

export function currentReviewStreak(events: ReviewEvent[], reference = new Date()) {
  const completedDates = new Set(
    events
      .filter((event) => event.action === "completed")
      .map((event) => isoDateFromTimestamp(event.created_at))
      .filter((date): date is string => Boolean(date)),
  );
  let offset = completedDates.has(localIsoDate(0, reference)) ? 0 : -1;
  let streak = 0;
  while (completedDates.has(localIsoDate(offset, reference))) {
    streak += 1;
    offset -= 1;
  }
  return streak;
}

export function completedReviewsThisWeek(events: ReviewEvent[], reference = new Date()) {
  const weekday = (reference.getDay() + 6) % 7;
  const start = localIsoDate(-weekday, reference);
  const end = localIsoDate(6 - weekday, reference);
  return events.filter((event) => {
    if (event.action !== "completed") return false;
    const date = isoDateFromTimestamp(event.created_at);
    return Boolean(date && date >= start && date <= end);
  }).length;
}

export function learnedCapacityForDate(date: string, events: ReviewEvent[]) {
  const target = new Date(`${date}T12:00:00`);
  const targetWeekday = target.getDay();
  const reference = normalizedDate();
  const samples = new Map<string, { completed: number; touched: boolean }>();

  events.forEach((event) => {
    const sampleDate = isoDateFromTimestamp(event.created_at);
    if (!sampleDate) return;
    const age = -dateDifference(reference, sampleDate);
    if (age < 0 || age > 56 || new Date(`${sampleDate}T12:00:00`).getDay() !== targetWeekday) return;
    const sample = samples.get(sampleDate) ?? { completed: 0, touched: false };
    sample.touched = true;
    if (event.action === "completed") sample.completed += 1;
    samples.set(sampleDate, sample);
  });

  const values = [...samples.values()].filter((sample) => sample.touched).map((sample) => sample.completed);
  if (values.length < 2) return DEFAULT_REVIEW_CAPACITY;
  return Math.max(1, Math.min(5, Math.round(values.reduce((total, value) => total + value, 0) / values.length)));
}

export function capacityForDate(date: string, dayPlans: ReviewDayPlan[], events: ReviewEvent[]) {
  return dayPlans.find((plan) => plan.plan_date === date)?.capacity ?? learnedCapacityForDate(date, events);
}

export function buildSmartReschedulePlan({
  entries,
  events,
  dayPlans,
  todayCapacity,
  reference = new Date(),
}: {
  entries: ReviewEntry[];
  events: ReviewEvent[];
  dayPlans: ReviewDayPlan[];
  todayCapacity: number;
  reference?: Date;
}) {
  const today = localIsoDate(0, reference);
  const dueEntries = dueReviewEntries(entries, reference);
  const remainingToday = Math.max(0, todayCapacity - completedReviewsOn(today, events));
  const entriesToMove = dueEntries.slice(remainingToday);
  const scheduledLoad = new Map<string, number>();
  const scheduledSubjects = new Map<string, Set<string>>();

  futureReviewEntries(entries, reference).forEach((entry) => {
    const date = entry.nextReviewDate!;
    scheduledLoad.set(date, (scheduledLoad.get(date) ?? 0) + 1);
    const subjects = scheduledSubjects.get(date) ?? new Set<string>();
    subjects.add(entry.subject.id);
    scheduledSubjects.set(date, subjects);
  });

  return entriesToMove.map<ReviewScheduleChange>((entry) => {
    const assessmentOffset = entry.assessment?.date
      ? dateDifference(reference, entry.assessment.date)
      : null;
    const latestOffset = assessmentOffset && assessmentOffset > 1
      ? Math.min(21, assessmentOffset - 1)
      : assessmentOffset !== null
        ? 1
        : 21;
    const candidateDates = Array.from({ length: Math.max(1, latestOffset) }, (_, index) => localIsoDate(index + 1, reference));

    const availableDate = (avoidSameSubject: boolean) => candidateDates.find((date) => {
      const capacity = capacityForDate(date, dayPlans, events);
      const load = scheduledLoad.get(date) ?? 0;
      const sameSubject = scheduledSubjects.get(date)?.has(entry.subject.id) ?? false;
      return capacity > load && (!avoidSameSubject || !sameSubject);
    });
    let targetDate = availableDate(true) ?? availableDate(false);

    if (!targetDate) {
      targetDate = [...candidateDates].sort((a, b) => {
        const aCapacity = Math.max(1, capacityForDate(a, dayPlans, events));
        const bCapacity = Math.max(1, capacityForDate(b, dayPlans, events));
        const aRatio = (scheduledLoad.get(a) ?? 0) / aCapacity;
        const bRatio = (scheduledLoad.get(b) ?? 0) / bCapacity;
        return aRatio - bRatio || a.localeCompare(b);
      })[0] ?? localIsoDate(1, reference);
    }

    scheduledLoad.set(targetDate, (scheduledLoad.get(targetDate) ?? 0) + 1);
    const subjects = scheduledSubjects.get(targetDate) ?? new Set<string>();
    subjects.add(entry.subject.id);
    scheduledSubjects.set(targetDate, subjects);
    return {
      entry,
      fromDate: entry.nextReviewDate ?? today,
      toDate: targetDate,
    };
  });
}

export function buildReviewWeekLoad(
  events: ReviewEvent[],
  dayPlans: ReviewDayPlan[],
  todayCapacity: number,
  queueItems: ReviewQueueItem[] = [],
  reference = new Date(),
): ReviewDayLoad[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = localIsoDate(offset, reference);
    const dateObject = new Date(`${date}T12:00:00`);
    const manuallyPlanned = queueItems.filter((item) => item.queue_date === date && item.state === "planned").length;
    const scheduled = manuallyPlanned;
    return {
      date,
      label: offset === 0
        ? "Hoje"
        : new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(dateObject).replace(".", ""),
      shortDate: formatDate(date),
      scheduled,
      completed: completedReviewsOn(date, events),
      capacity: offset === 0 ? todayCapacity : capacityForDate(date, dayPlans, events),
    };
  });
}
