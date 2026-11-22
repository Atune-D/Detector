/**
 * Hand-built fact pairs for the spec §6.1 behaviour rows. Each export is one row.
 * Date convention: the night in question is 2023-11-03.
 */
import { E, allTime, at, bound, day, period, scenario, someTime, span, tm } from "./builders";

export const NIGHT = "2023-11-03";

const evening = (original = "all evening") => period(NIGHT, "evening", original);

// --- state ----------------------------------------------------------------------

/** 同一晚"一直在家" vs "出去买菜" -> direct 85 */
export const homeAllEveningVsWentOut = scenario(
  {
    question: "Where were you on the evening of November 3rd?",
    answer: "I was at home all evening.",
    fact: { id: "a-home", action: "location.home", time: evening() },
  },
  {
    question: "What did you do on the evening of November 3rd?",
    answer: "I went out to buy groceries at 7:30.",
    fact: { id: "b-out", action: "location.out", time: at(NIGHT, "19:30", [], "at 7:30") },
  },
);

/** 同上，但后者是 "I think I went out" -> direct 75 */
export const homeAllEveningVsIThinkWentOut = scenario(
  {
    question: "Where were you on the evening of November 3rd?",
    answer: "I was at home all evening.",
    fact: { id: "a-home", action: "location.home", time: evening() },
  },
  {
    question: "What did you do on the evening of November 3rd?",
    answer: "I think I went out to buy groceries at 7:30.",
    fact: {
      id: "b-out",
      action: "location.out",
      time: at(NIGHT, "19:30", [], "at 7:30"),
      uncertainty: [{ text: "I think", modifies: "action" }],
    },
  },
);

/** "订披萨" vs "买菜" -> false positive */
export const pizzaVsGroceries = scenario(
  {
    question: "Did you eat that night?",
    answer: "I ordered pizza around 7.",
    fact: { id: "a-pizza", action: "activity.ordered_food", time: at(NIGHT, "19:00", [tm("around", "approx")], "around 7") },
  },
  {
    question: "What did you do that night?",
    answer: "I bought groceries at 7:30.",
    fact: { id: "b-groceries", action: "activity.bought_groceries", time: at(NIGHT, "19:30", [], "at 7:30") },
  },
);

/** 昨天在家 vs 今天在商场 -> false positive (time disjoint) */
export const homeYesterdayVsMallToday = scenario(
  {
    question: "Where were you on November 2nd?",
    answer: "I was at home all day on the 2nd.",
    fact: { id: "a-home-2nd", action: "location.home", time: day("2023-11-02", "2023-11-03", "all day on the 2nd") },
  },
  {
    question: "Where were you on November 3rd?",
    answer: "On the 3rd I was at the mall.",
    fact: { id: "b-mall-3rd", action: "location.place", location: E.mall, time: day("2023-11-03", "2023-11-04", "On the 3rd") },
  },
);

/** "20:00–21:00 在家" vs "21:05–21:15 在超市" -> false positive */
export const home20to21VsSupermarket2105 = scenario(
  {
    question: "Where were you between 8 and 9?",
    answer: "From 8:00 to 9:00 I was at home.",
    fact: { id: "a-home-8-9", action: "location.home", time: span(bound(NIGHT, "20:00"), bound(NIGHT, "21:00"), "From 8:00 to 9:00") },
  },
  {
    question: "Where were you after 9?",
    answer: "I was at the supermarket from 9:05 to 9:15.",
    fact: {
      id: "b-supermarket",
      action: "location.place",
      location: E.supermarket,
      time: span(bound(NIGHT, "21:05"), bound(NIGHT, "21:15"), "from 9:05 to 9:15"),
    },
  },
);

/** 在家 vs 在停车场挥手，停车场位置不明 -> needs review */
export const homeVsParkingLot = scenario(
  {
    question: "Where were you between 7 and 9?",
    answer: "From 7:00 to 9:00 I was at home.",
    fact: { id: "a-home-7-9", action: "location.home", time: span(bound(NIGHT, "19:00"), bound(NIGHT, "21:00"), "From 7:00 to 9:00") },
  },
  {
    question: "Did you see anyone that night?",
    answer: "I waved to a neighbour in the parking lot at 8:00.",
    fact: { id: "b-parking", action: "location.place", location: E.parkingLot, time: at(NIGHT, "20:00", [], "at 8:00") },
  },
);

/** 同一时段"始终在家" vs "在外地开车" -> direct 85 (driving location extracted as a location fact) */
export const homeVsDrivingOutOfTown = scenario(
  {
    question: "Where were you between 7 and 9?",
    answer: "From 7:00 to 9:00 I was at home the whole time.",
    fact: { id: "a-home-7-9", action: "location.home", time: span(bound(NIGHT, "19:00"), bound(NIGHT, "21:00"), "From 7:00 to 9:00") },
  },
  {
    question: "What were you doing at 8?",
    answer: "At 8:00 I was driving in Springfield.",
    fact: { id: "b-springfield", action: "location.out", location: E.otherCity, time: at(NIGHT, "20:00", [], "At 8:00") },
  },
);

/** "只有我一个人" vs "当时不止我一个人" -> direct 85 */
export const aloneVsNotAlone = scenario(
  {
    question: "Was anyone with you between 7 and 9?",
    answer: "From 7:00 to 9:00 it was only me.",
    fact: {
      id: "a-alone",
      action: "company.alone",
      location: E.home,
      time: span(bound(NIGHT, "19:00"), bound(NIGHT, "21:00"), "From 7:00 to 9:00"),
    },
  },
  {
    question: "Was anyone with you at 8?",
    answer: "At 8:00 I was not the only one there.",
    fact: { id: "b-accompanied", action: "company.accompanied", location: E.home, time: at(NIGHT, "20:00", [], "At 8:00") },
  },
);

/** 持续状态收缩后确定范围为空 -> needs review; overlap must not be confirmed */
export const emptyCertainRange = scenario(
  {
    question: "When were you at home?",
    answer: "From about 8:00 to about 8:20 I was at home.",
    fact: {
      id: "a-home-fuzzy",
      action: "location.home",
      time: span(bound(NIGHT, "20:00", [tm("about", "approx")]), bound(NIGHT, "20:20", [tm("about", "approx")]), "From about 8:00 to about 8:20"),
    },
  },
  {
    question: "When were you out?",
    answer: "I was out from 8:05 to 8:10.",
    fact: { id: "b-out-805", action: "location.out", time: span(bound(NIGHT, "20:05"), bound(NIGHT, "20:10"), "from 8:05 to 8:10") },
  },
);

/** "20:00–21:00 在家" vs "21:00–22:00 在外" -> false positive (endpoints only touch) */
export const touchingEndpoints = scenario(
  {
    question: "Where were you between 8 and 9?",
    answer: "From 8:00 to 9:00 I was at home.",
    fact: { id: "a-home-8-9", action: "location.home", time: span(bound(NIGHT, "20:00"), bound(NIGHT, "21:00"), "From 8:00 to 9:00") },
  },
  {
    question: "Where were you between 9 and 10?",
    answer: "From 9:00 to 10:00 I was out.",
    fact: { id: "b-out-9-10", action: "location.out", time: span(bound(NIGHT, "21:00"), bound(NIGHT, "22:00"), "From 9:00 to 10:00") },
  },
);

// --- event time -------------------------------------------------------------------

/** 同一次到达"大约 8 点" vs "8:05" -> false positive */
export const arrivalAround8Vs805 = scenario(
  {
    question: "When did you arrive at the party?",
    answer: "When I arrived it was around 8.",
    fact: { id: "a-arrival", action: "arrival", occurrence: { kind: "definite" }, time: at(NIGHT, "20:00", [tm("around", "approx")], "around 8") },
  },
  {
    question: "What time was your arrival at the party?",
    answer: "I arrived at 8:05.",
    fact: { id: "b-arrival", action: "arrival", occurrence: { kind: "definite" }, time: at(NIGHT, "20:05", [], "at 8:05") },
  },
);

/** 同一次到达"准确 8:00" vs "准确 8:05" -> direct 85 */
export const arrivalExact800VsExact805 = scenario(
  {
    question: "When did you arrive at the party?",
    answer: "I arrived at exactly 8:00.",
    fact: { id: "a-arrival", action: "arrival", occurrence: { kind: "definite" }, time: at(NIGHT, "20:00", [tm("exactly", "exact")], "exactly 8:00") },
  },
  {
    question: "What time was your arrival at the party?",
    answer: "I arrived at 8:05 sharp.",
    fact: { id: "b-arrival", action: "arrival", occurrence: { kind: "definite" }, time: at(NIGHT, "20:05", [tm("sharp", "exact")], "8:05 sharp") },
  },
);

/** 证词明确说明是两次不同的外出，时间不同 -> false positive */
export const twoDistinctOutings = scenario(
  {
    question: "When did you go out?",
    answer: "The first time I went out was at 7:00.",
    fact: { id: "a-out-1", action: "went_out", occurrence: { kind: "ordinal", n: 1 }, time: at(NIGHT, "19:00", [], "at 7:00") },
  },
  {
    question: "Tell me about going out that night.",
    answer: "The second time I went out was at 9:00.",
    fact: { id: "b-out-2", action: "went_out", occurrence: { kind: "ordinal", n: 2 }, time: at(NIGHT, "21:00", [], "at 9:00") },
  },
);

/** 两个外出时间不同，无法确定是不是同一次 -> needs review (same event?) */
export const outingsUndetermined = scenario(
  {
    question: "When did you go out?",
    answer: "I went out at 7:00.",
    fact: { id: "a-out", action: "went_out", time: at(NIGHT, "19:00", [], "at 7:00") },
  },
  {
    question: "Tell me about going out that night.",
    answer: "I went out at 9:00.",
    fact: { id: "b-out", action: "went_out", time: at(NIGHT, "21:00", [], "at 9:00") },
  },
);

// --- negation ---------------------------------------------------------------------

/** 没去过仓库 vs 开车经过附近 -> false positive (passed_through vs been_to relation) */
export const neverBeenToWarehouseVsDroveThroughArea = scenario(
  {
    question: "Have you been to the Hargrove Street warehouse?",
    answer: "I have never been to the warehouse.",
    fact: { id: "a-not-been", action: "been_to", polarity: "negative", object: E.warehouse, time: allTime("never") },
  },
  {
    question: "Have you been near Hargrove Street?",
    answer: "I drove through that area.",
    fact: { id: "b-passed", action: "passed_through", object: E.hargroveArea, time: someTime("drove through") },
  },
);

/** 没进过仓库 vs 去过仓库里的办公室 -> direct 85 (containment rule of entering-type predicates) */
export const neverEnteredWarehouseVsWasInItsOffice = scenario(
  {
    question: "Did you ever go inside the warehouse?",
    answer: "I never went inside the warehouse.",
    fact: { id: "a-not-entered", action: "entered", polarity: "negative", object: E.warehouse, time: allTime("never") },
  },
  {
    question: "Have you been to the office in the warehouse?",
    answer: "I went into the office in the warehouse once.",
    fact: { id: "b-entered-office", action: "entered", object: E.warehouseOffice, time: someTime("once") },
  },
);

/** 没买过整栋楼 vs 买过其中一套公寓 -> needs review (no containment rule for "bought") */
export const neverBoughtBuildingVsBoughtApartment = scenario(
  {
    question: "Did you buy the Maple building?",
    answer: "I never bought the Maple building.",
    fact: { id: "a-not-bought", action: "bought", polarity: "negative", object: E.building, time: allTime("never") },
  },
  {
    question: "Do you own property in the Maple building?",
    answer: "I bought apartment 4B there.",
    fact: { id: "b-bought-apt", action: "bought", object: E.apartment, time: someTime("bought") },
  },
);

/** 去年不认识 vs 今年认识 -> false positive (time clearly outside the negated period) */
export const didNotKnowLastYearVsKnowsThisYear = scenario(
  {
    question: "Did you know Tom in 2023?",
    answer: "In 2023 I did not know Tom.",
    fact: { id: "a-not-know-2023", action: "knows", polarity: "negative", object: E.tom, time: day("2023-01-01", "2024-01-01", "In 2023") },
  },
  {
    question: "Do you know Tom?",
    answer: "Yes, in 2024 I know Tom.",
    fact: { id: "b-know-2024", action: "knows", object: E.tom, time: day("2024-01-01", "2025-01-01", "in 2024") },
  },
);

/** "没有整晚在家" vs "8 点在家" -> needs review (negation of "all" is not parsed) */
export const notHomeAllEveningUniversalVsHomeAt8 = scenario(
  {
    question: "Were you at home that evening?",
    answer: "I wasn't at home all evening.",
    fact: { id: "a-not-all-evening", action: "location.home", polarity: "negative", negationForm: "universal", time: evening() },
  },
  {
    question: "Where were you at 8?",
    answer: "At 8 I was at home.",
    fact: { id: "b-home-8", action: "location.home", time: at(NIGHT, "20:00", [], "At 8") },
  },
);

/** "整晚都不在家" vs "当晚 8 点在家" -> direct 85 */
export const notHomeWholeEveningVsHomeAt8 = scenario(
  {
    question: "Were you at home that evening?",
    answer: "I was not at home at any point all evening.",
    fact: { id: "a-never-home-evening", action: "location.home", polarity: "negative", negationForm: "whole", time: evening() },
  },
  {
    question: "Where were you at 8 that night?",
    answer: "At 8 that night I was at home.",
    fact: { id: "b-home-8", action: "location.home", time: at(NIGHT, "20:00", [], "At 8") },
  },
);

/** "没看见 Tom" vs "和 Tom 说过话" -> needs review (different predicates, no relation rule) */
export const didNotSeeTomVsTalkedWithTom = scenario(
  {
    question: "Did you see Tom that night?",
    answer: "I did not see Tom.",
    fact: { id: "a-not-saw", action: "saw", polarity: "negative", object: E.tom, time: evening("that night") },
  },
  {
    question: "Did you talk to Tom that night?",
    answer: "I talked with Tom.",
    fact: { id: "b-talked", action: "talked_with", object: E.tom, time: evening("that night") },
  },
);

// --- template ---------------------------------------------------------------------

const ALONE_IN_OFFICE = {
  question: "Was anyone in your office between 2 and 4?",
  answer: "From 2:00 to 4:00 I was alone in my office the whole time.",
  fact: {
    id: "a-alone-office",
    action: "company.alone",
    location: E.office,
    time: span(bound(NIGHT, "14:00"), bound(NIGHT, "16:00"), "From 2:00 to 4:00"),
  },
} as const;

/** 办公室始终只有自己 vs 同一时段与 Tom 在该办公室面对面交谈 -> inferential 75, only this candidate */
export const aloneInOfficeVsFaceToFaceInOffice = scenario(ALONE_IN_OFFICE, {
  question: "Did you speak with Tom that afternoon?",
  answer: "At 3:00 Tom and I talked face to face in my office.",
  fact: {
    id: "b-f2f-office",
    // The extractor wrote the state "someone present", but marked it as derived from the activity.
    action: "company.accompanied",
    stateSource: { kind: "derived", activity: { predicate: "activity.conversation_face_to_face", counterpart: "tom", text: "Tom and I talked face to face" } },
    location: E.office,
    time: at(NIGHT, "15:00", [], "At 3:00"),
  },
});

/** 办公室始终只有自己 vs 同一时段与 Tom 在楼下大厅交谈 -> needs review (space scope mismatch) */
export const aloneInOfficeVsFaceToFaceInLobby = scenario(ALONE_IN_OFFICE, {
  question: "Did you speak with Tom that afternoon?",
  answer: "At 3:00 Tom and I talked face to face in the downstairs lobby.",
  fact: {
    id: "b-f2f-lobby",
    action: "company.accompanied",
    stateSource: { kind: "derived", activity: { predicate: "activity.conversation_face_to_face", counterpart: "tom", text: "Tom and I talked face to face" } },
    location: E.lobby,
    time: at(NIGHT, "15:00", [], "At 3:00"),
  },
});

/** "给 Tom 打了电话" vs "始终只有自己" -> needs review (no co-presence can be inferred) */
export const aloneInOfficeVsPhoneCall = scenario(ALONE_IN_OFFICE, {
  question: "Did you contact Tom that afternoon?",
  answer: "At 3:00 I called Tom from my office.",
  fact: { id: "b-phone", action: "activity.phone_call", object: E.tom, location: E.office, time: at(NIGHT, "15:00", [], "At 3:00") },
});

/** 10 点睡着 vs 11 点有活动，没说是否醒过 -> needs review (no template) */
export const asleepAt10VsActiveAt11 = scenario(
  {
    question: "When did you fall asleep?",
    answer: "I fell asleep at 10:00.",
    fact: { id: "a-sleep-10", action: "sleep_onset", time: at(NIGHT, "22:00", [], "at 10:00") },
  },
  {
    question: "Did you make any calls that night?",
    answer: "At 11:00 I took a phone call.",
    fact: { id: "b-call-11", action: "activity.phone_call", time: at(NIGHT, "23:00", [], "At 11:00") },
  },
);

/** "订过披萨"和"认识 Tom"，没有人提出冲突理由 -> no candidate */
export const pizzaVsKnowsTom = scenario(
  {
    question: "Did you eat that night?",
    answer: "I ordered pizza.",
    fact: { id: "a-pizza", action: "activity.ordered_food", time: at(NIGHT, "19:00", [], "that night") },
  },
  {
    question: "Do you know Tom?",
    answer: "Yes, I know Tom.",
    fact: { id: "b-knows-tom", action: "knows", object: E.tom, time: someTime("know") },
  },
);
