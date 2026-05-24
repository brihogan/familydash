/**
 * Import CuriosityUntamed Awards into FamilyDash.
 *
 * Awards live in the same `badges` table with is_award=1. They share the badge
 * image-serving and browser infrastructure but use `award_type` + `award_config`
 * to drive a different completion + detail-page UX.
 *
 * Idempotent: INSERT OR IGNORE on slug, image download skips files that exist.
 *
 * Usage (from repo root):
 *   node --env-file=.env server/scripts/importAwards.js
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH      = process.env.DATABASE_PATH || join(__dirname, '../../data/family.db');
const IMAGES_DEST  = join(dirname(DB_PATH), 'uploads', 'badges'); // shared bucket; same URL prefix as badges

// ─── Award definitions ────────────────────────────────────────────────────────
// One row per award. `image_url` is fetched and saved as `image_file` (basename).
//
// award_type values:
//   'specific_badges'   — fixed list of badge names earned at the kid's level
//   'area_coverage'     — at least one badge per area at the kid's level (Discovery)
//   'count_at_level'    — N badges at any single level (Wow)
//   'composite'         — N other awards earned (Gem)
//   'task_list'         — per-level checklist of tasks (Life Skills, Outdoors)
//                         steps may mix badge references and free-text activities
//   'manual'            — parent confirms (Servant's Heart, Make a Difference, etc.)
//
// award_config schema by type:
//   specific_badges:  {"badge_names": ["U.S. Constitution", "Elections", ...]}
//   area_coverage:    {} (areas are implicit — all 9 Areas of Discovery)
//   count_at_level:   {"min": 100}
//   composite:        {"award_slugs": ["servants-heart","make-a-difference",...]}
//   task_list:        {"per_level": {"preschool":[{type,text|badge_name|...}], "level1":[…]}}
//                     step types: "badge" (specific badge to earn), "activity" (text only)
//   manual:           {"hint": "Parent confirms when ..."}

// Life Skills Achievement Award — per-level task lists sourced from the official
// CU sub-pages (member-only on the public site, so pasted in manually). Each
// non-Preschool level repeats item 1 as "Complete all [prior level] requirements"
// to mirror the printed checklist, matching how Outdoors is structured.
const LIFE_SKILLS_PER_LEVEL = {
  preschool: [
    `Know your first and last name and the first and last names of your family members, especially parents, guardians, and frequent caretakers.`,
    `Say sorry when you are wrong and own up to any behavior honestly. Explain why lying is bad.`,
    `Learn to play a simple group game and wait patiently for your turn.`,
    `Do not interrupt others when they are speaking. Simply place a hand on their arm until you have their attention and wait for them to address you.`,
    `Learn simple manners such as saying please and thank you, how to politely address adults, and how to request help appropriately.`,
    `Be able to follow simple directions without argument (e.g. put away your toy).`,
    `Learn proper behavior when in a restaurant. Quiet voices, stay in your seat, etc.`,
    `Learn to throw trash away properly and how to sort trash when needed.`,
    `Learn words to express your feelings such as angry, sad, happy, excited, frustrated, etc.`,
    `Draw a face and be able to identify the different parts (eyes, ears, nose, mouth, etc.) and draw stick people.`,
    `Demonstrate that you know what it means to wait your turn.`,
    `Help clean your room and help make your bed. Demonstrate that you can put your dirty clothes in the hamper and put your own toys away.`,
    `Set the table with some assistance.`,
    `Eat using all utensils and drink out of an open-top glass (not a sippy cup). Use polite table manners — chewing with mouth closed, asking someone to pass you something instead of reaching for it, and using your utensils instead of your fingers to eat.`,
    `Show that you know how to put all your toys away.`,
    `Learn to clean up your own spills.`,
    `Sort items by size, shape, color, and function (what you eat with vs. what you fix your hair with). Be able to tell when an item does not belong. Match objects that go together: sort dull knives, spoons, and forks into a silverware tray, or match socks.`,
    `Pay attention to a storybook story and be able to briefly tell who the main character is and one thing that happened. Be able to identify the emotions of storybook characters (happy, sad, scared, etc.).`,
    `Understand what is meant by: more, less, same, equal, bigger, smaller, in front of, behind, next to, on top of, inside, outside, up, and down. Learn simple opposites (up/down, hot/cold, etc.).`,
    `Sing simple songs and repeat simple rhymes. Be able to sing a single-verse song with all the words (like Itsy-Bitsy Spider, Mary had a Little Lamb, or Twinkle Twinkle Little Star).`,
    `When getting ready for the day, brush your own teeth and get yourself dressed, including getting your shoes on the correct feet. Brush your own hair.`,
    `Know how to cross the road safely using Stop, Look & Listen with parental supervision.`,
    `Help make a salad for dinner, including washing vegetables and tearing lettuce.`,
    `Be able to open simple containers or snack packages by yourself.`,
    `Develop a family stranger-danger secret code word. (If someone you don't know does not know the family secret code word, you shouldn't go anywhere with them.)`,
    `With parental supervision, put your face under water in a bath tub, at a swimming pool, or in a lake and blow bubbles.`,
    `With your family, establish an outdoor meeting place in case of a house fire.`,
    `Learn how to behave safely around animals you don't know.`,
    `Be daytime potty trained. Properly wash your hands with soap, and know when hand washing is needed (before eating, after using the restroom, etc.).`,
    `Understand the basic difference between healthy and unhealthy foods.`,
  ],
  level1: [
    `Be able to complete all Preschool requirements.`,
    `Wash, dry, and brush your own hair. Floss your teeth.`,
    `Sweep the floor and use a dust pan.`,
    `Tie your shoes.`,
    `Properly make a bed.`,
    `Sort laundry for washing; fold and put away your own clothes.`,
    `Tell time on an analog clock.`,
    `Properly set a table.`,
    `Demonstrate the proper way to hold and use a fork, knife, and spoon and where to place your napkin.`,
    `Make a sandwich by yourself (including clean up).`,
    `Pump yourself on a swing.`,
    `Ride a bike with no training wheels.`,
    `Learn basic water safety and be able to swim 15 ft without a flotation device. If no pool or water is available, at least learn the water safety.`,
    `Understand the difference between needs and wants.`,
    `Know your complete address with zip code, and phone number with area code.`,
    `Identify and be able to use a screwdriver, hammer, wrench, and pliers.`,
    `Know what to do in case of fire — stop, drop & roll; stay low to the ground, don't open hot doors, fire escape plans, etc.`,
    `Know how to treat small cuts, scrapes, and bug bites.`,
    `Properly turn on and shut down a computer, tablet, or smart phone.`,
    `Save money toward a short-term goal.`,
    `Write a thank-you note and properly address and stamp an envelope.`,
    `Be able to identify any poisonous plants and dangerous animals in your neighborhood and what to do if you come in contact with them.`,
    `Know how to dial 911 and what type of information you will need to have ready.`,
    `Throw and catch a ball a distance of 10 feet.`,
    `Properly weed a small patch of your yard, showing how to pull weeds up by the roots.`,
    `Plant and care for a seed and then transplant the seedling to a pot or garden.`,
    `Help cook a simple recipe that includes cracking an egg.`,
    `Show an understanding of basic measurements (inch, foot, yard, mile, ounce, pound, ton, cup, pint, quart, gallon, teaspoon, and tablespoon).`,
    `Walk one mile without complaint.`,
    `Walk 10 feet on a 4-inch-wide beam.`,
  ],
  level2: [
    `Demonstrate the ability to complete all Level 1 Achievement skills.`,
    `Bake and frost a cake by yourself (with adult supervision).`,
    `Properly vacuum a room and demonstrate how to clean out the filter or change the bag.`,
    `Change the sheets on a bed.`,
    `Sew on a button.`,
    `Sew a simple seam.`,
    `Understand the importance of keeping login information private and not sharing passwords.`,
    `Properly mop a floor.`,
    `Hand wash and dry dishes. Load and unload a dishwasher if you have one.`,
    `Learn to save a file and then find that file on a computer, tablet, or phone.`,
    `Identify safe vs. unsafe water conditions (currents, drop-offs, slippery edges, deep vs. shallow water). If water is available, swim 30 feet without a flotation device, tread water for 3 minutes, and float on your back for 2 minutes.`,
    `Complete both a forward and backward roll. (You can keep from being severely injured during a fall if you know the proper way to roll.) The backward roll does not have to be perfect — practice falling backward into a roll.`,
    `Throw and catch a ball a distance of 15 feet.`,
    `Know the following Federal Flag Code rules: stand still and face the flag during the Pledge of Allegiance or the national anthem; the American Flag should never touch the ground; do not use the flag as clothing, paper napkins or plates, or costumes; raise the flag quickly and lower it respectfully. Understand why these rules matter.`,
    `Safely use a glue gun, hammer in a nail, tighten and loosen screws with a screwdriver and bolts with a wrench.`,
    `Use a can opener.`,
    `Demonstrate how to scramble eggs.`,
    `Fix a complete breakfast with adult supervision including at least one hot food.`,
    `Fix a complete dinner with adult supervision including at least one hot food.`,
    `Wrap a present (with paper, no bags). Learn to fold the ends properly and make a "+" style ribbon tie using only one strand of ribbon.`,
    `Tie two strings or ropes together using a square knot.`,
    `Know the words to the National Anthem and what they mean.`,
    `Demonstrate responsibility for personal belongings over time. Keep them clean, in good repair, and put away properly.`,
    `Demonstrate how to safely use an internet search engine or AI to research information online (only with parent's permission). Understand why facts need to be rechecked and that you cannot just believe everything right away.`,
    `Be able to send an email. Understand how email differs from text or chats.`,
    `Compare prices and be able to determine best value.`,
    `Identify items in a basic first aid kit and know how to use them.`,
    `Know proper first aid for cuts, scrapes, blisters, minor burns or scalds, nosebleeds, and sunburn.`,
    `Prepare a budget for a meal, trip, party, or some other occasion.`,
    `Properly clean a toilet.`,
  ],
  level3: [
    `Demonstrate the ability to complete all Preschool, Level 1 & 2 Achievement tasks.`,
    `Do a complete load of laundry (sort, wash, dry, fold, and put away).`,
    `Scrub showers and sinks, including cleaning out the drains.`,
    `Demonstrate how to properly fold the American Flag.`,
    `Demonstrate the Heimlich maneuver and tell when it is used.`,
    `Demonstrate safe handling and cooking of chicken, beef, and pork.`,
    `Demonstrate how a compass works and how to orient a map. Explain what map symbols mean.`,
    `Be able to give accurate directions to your house from several different locations in town.`,
    `Demonstrate how to properly start, tend, and extinguish a fire (with adult supervision). This can be in a fireplace, wood stove, or campfire pit.`,
    `Know first aid for heat exhaustion, heat stroke, hypothermia, serious burns, puncture wounds from splinters / nails / fishhooks, an object in the eye, and shock.`,
    `Demonstrate non-swimming water rescue methods: reaching with an arm or leg, reaching with a suitable object, and throwing a line or flotation device. Explain why swimming rescues should not be attempted if a reaching or throwing rescue is possible.`,
    `Plan, budget, shop for, and cook a complete meal.`,
    `Know your constitutional rights and obligations as a US Citizen.`,
    `Start a savings account and understand deposits, withdrawals, and balances.`,
    `Understand digital footprints and long-term consequences online, and understand the dangers of social media.`,
    `Have a complete understanding of the monthly bills it takes to run a house (mortgage/rent, gas/electricity, water, phones, cable/satellite, internet connections, food, trash, etc.).`,
    `Know how to tell if your favorite produce is fresh and ripe.`,
    `Understand standard measurements for length, width, perimeter, area, volume, height, and weight.`,
    `Be able to round to the nearest dollar and estimate the total cost of 5 items in your head.`,
    `Be able to calculate 10% of any number in your head.`,
    `Understand how our government works at the local, state, and federal levels.`,
    `Understand our judicial system and your role within it (jury duty).`,
    `Demonstrate an organized approach to achieving goals, including identifying and prioritizing tasks and setting and following an effective schedule.`,
    `Demonstrate your understanding of time management and useful tools that can help (calendars, notebooks, computers, apps, etc.).`,
    `Demonstrate your ability to observe things around you. Walk ¼ mile three times: first try to remember the cars (color, type, where parked); second pay attention to people (male/female, clothing, age, height, hair, eyes); third observe buildings (stories, doors, windows, colors, roof type). You don't need a perfect memory — you DO need to understand the importance of observing things around you and how those details may be important in an emergency.`,
    `Properly iron a pair of pants, a shirt, and a dress or skirt.`,
    `Understand basic child care including how to properly hold, change, and feed an infant, child-proof a room for a toddler, and provide appropriate snacks and entertainment.`,
    `Know the difference between "dry clean only," "hand wash," "machine wash," "tumble dry," and "line dry." Understand the consequences of not cleaning an item according to the instructions.`,
    `Know the difference between cooking terms including: fry, baste, broil, bake, sauté, poach, whip, and mix.`,
    `Know what the Poison Control Center is and how to reach them if necessary.`,
  ],
  level4: [
    `Demonstrate the ability to complete all Preschool, Level 1, 2, & 3 Achievement tasks.`,
    `Understand the concept of interest and how it can work both for and against you (investments vs. credit cards).`,
    `Interpret credit applications and recognize how to use and maintain credit.`,
    `Explain how to obtain, maintain, and cancel household utilities.`,
    `Get your driver's license if feasible. If not, plan and complete a trip using public transportation (routes, timing, and cost). Demonstrate how to safely use rideshare services or taxis, including verifying driver and vehicle information.`,
    `Be able to compute mileage and gasoline consumption.`,
    `Understand car insurance and what it does and does not cover.`,
    `Understand ethical concerns related to AI use. Explain the difference between human-created and AI-generated content. Use AI to assist with research, writing, or problem-solving and then evaluate AI-generated information for accuracy and bias.`,
    `Learn to use online tools for collaboration (shared docs, communication platforms, etc.).`,
    `Understand basic car maintenance including oil changes, tire pressure, tire rotation, air filters, and tune-ups.`,
    `Identify consumer protection resources available when confronted with fraudulent practices.`,
    `Identify procedures the consumer can follow if merchandise or service is unsatisfactory.`,
    `Be able to interpret product guarantees and warranties and how to use them.`,
    `Demonstrate the proper use of bank accounts. Demonstrate how to properly maintain and balance an account so you do not become overdrawn.`,
    `Understand your family's medical history and be able to fill out a medical history form (ask aunts, uncles, grandparents, etc.).`,
    `Be able to interpret nutritional and related information listed on food labels.`,
    `Follow procedures for applying for a job, including interpreting and completing job applications, resumes, and letters of application. Write and format a professional cover letter for a specific job, customizing it to the position and explaining why you are a strong candidate.`,
    `Understand procedures involved in interviewing for a job. Prepare for and participate in a mock interview, including researching the role, practicing answers, and demonstrating professional communication, appearance, and behavior.`,
    `Understand wages, wage deductions, benefits, and timekeeping forms.`,
    `Understand how to fill out a voter registration card (and where to get one), interpret a ballot, and know where to get information regarding issues and candidates.`,
    `Understand how to file taxes as well as all deadlines and penalties for not doing it on time.`,
    `Be able to identify and paraphrase pertinent information, defining fact from opinion, in readings as well as in conversations.`,
    `Demonstrate proper form for basic body-weight exercises (squat, push-up, plank).`,
    `Plan, budget, shop for, and cook one week's worth of meals.`,
    `Prepare a breakfast, lunch, and dinner from scratch (no prepared or boxed foods allowed).`,
    `Prepare a complete household budget.`,
    `Practice basic self-defense awareness and avoidance strategies.`,
    `Understand how to properly tie down or secure items for transport.`,
    `Understand and be able to use public transportation.`,
    `Understand the dangers and conveniences of purchasing items online. Know the difference between purchasing from an auction site vs. an online store, and your rights and responsibilities in each case. Look at an online purchase form and understand how to fill one out. If possible, actually make an online purchase. Be aware of online scams and what to look for.`,
  ],
  level5: [
    `Demonstrate the ability to complete all Preschool – Level 4 Life Skill Achievement tasks.`,
    `Understand how to read a ballot and explain why it is important to read through every bill, proposition, candidate description, etc. before voting.`,
    `Vote in your local election, but only after completing requirement 2. Be able to explain why you should never vote if you do not understand what or who you are voting for.`,
    `Demonstrate how to review and understand a contract before signing it (lease, job agreement, etc.). Explain the importance of understanding what you are signing.`,
    `Be able to explain the concepts of media bias and spin when watching, reading, or listening to the news. Explain the importance of getting your news from more than one source and getting both sides of every story. Compare and contrast two news stories on the exact same topic but presented through competing media; explain what each source feels is the most important information and why it differs.`,
    `Get certified in First Aid.`,
    `Get certified in CPR.`,
    `Understand basic insurance types (health, auto, renters/home) and what they cover.`,
    `Demonstrate how to resolve a customer service issue professionally (return, complaint, billing issue).`,
    `Demonstrate how to tie a tie.`,
    `Learn how to properly paint a room and paint one if possible. Know what tools are necessary such as painter's tape, drop cloths, edging brushes, etc.`,
    `Make a short informative public speech. This may be a simple update report at work, an announcement at church, etc. — anything that requires you to get up in front of a group of people and speak.`,
    `Demonstrate how to make a good first impression: make eye contact, have good posture, give a firm handshake, dress appropriately, stop any nervous fidgeting, speak clearly, do not interrupt.`,
    `Understand the importance of protecting your personal information and how to avoid identity theft. (FTC Identity Theft site: consumer.ftc.gov/features/feature-0014-identity-theft)`,
    `Implement basic computer safety on all your devices: create strong passwords, use firewalls and anti-virus software, recognize risky links and fake emails. For mobile devices or tablets, learn about entry safeguards such as fingerprints, swipe patterns, etc.`,
    `Understand how to protect your privacy on the Internet and mobile devices. Understand the privacy settings of any social program you use (Facebook, Instagram, X, TikTok, LinkedIn, etc.). Understand that anything posted to the internet, even in private communications, has the potential to be downloaded, saved, shared, and made public.`,
    `Know basic world geography: all seven continents; major U.S. cities (San Francisco, Los Angeles, Seattle, Portland, Dallas, Chicago, St. Louis, New York, Atlanta, Las Vegas, Detroit, Phoenix, Houston, Philadelphia, San Diego, San Antonio, San Jose, Indianapolis, Jacksonville, Columbus, Baltimore, Milwaukee, Memphis, Boston, Charlotte, Denver, Honolulu, Anchorage, Washington D.C.); major world cities (Amsterdam, London, Athens, Beijing, Berlin, Bangkok, Brussels, Budapest, Buenos Aires, Cairo, Sydney, Cape Town, Copenhagen, Damascus, Delhi, Dubai City, Dublin, Hanoi, Helsinki, Jerusalem, Kuala Lumpur, Lisbon, Madrid, Manila, Moscow, Tokyo, Paris, Prague, Rio de Janeiro, Stockholm, Toronto, Vienna, Venice, Zurich).`,
    `Learn how to remove various stains including blood, grease, and dirt.`,
    `Learn how to find a doctor, make an appointment, and what your health care options are.`,
    `Know how stress affects your life and your health, and how to develop positive coping skills that work for you. Identify three ways to reduce or eliminate stress, practice for a week, and evaluate the effectiveness of each strategy.`,
    `Education does not end with high school or college — it should continue for the rest of your life. Set up a plan for continuing education: books you plan to read, subjects you wish to research, classes you wish to take, skills you wish to learn, etc. Write down how you plan to continue your education.`,
    `Learn time management skills and create a general weekly and monthly schedule that will allow you to complete all your necessary activities and still leave some time to relax and have fun.`,
    `Describe and research ways to search for a job (friends or relatives, newspaper ads, applying directly to an employer, temporary agencies, internet research, government agencies, school placement center). Define transferable job skills and their value in getting a job. Describe ways to keep a job, ways to lose a job, and how to best deal with issues that may arise in the workplace. Describe dress code as it pertains to various jobs and explain why it is important to adhere to.`,
    `Learn how to safely plan and pay for travel. Review all policies (check-in, cancellation, fees, etc.). Research and compare booking directly with a provider versus using a third-party service, and explain how each impacts your ability to make changes, receive refunds, and resolve problems. Explain how to handle delayed or canceled flights or reservations. Understand how to deal with lost luggage or missing items. Know what cell phone service is available where you are going and if you need to make adjustments before you leave.`,
    `Learn how to properly use a fire extinguisher.`,
    `Learn how to put on snow chains or cables, or how to drive in inclement weather in your area (hydroplaning, ice, flooding, high winds, etc.). You are not required to actually drive in these conditions, just understand how if you are ever in that position.`,
    `Learn to recognize the warning signs of text, phone, and email scams and when not to give personal information to someone.`,
    `Learn how to properly plant, care for, and maintain a plant, flower, shrub, or tree in your yard or home. Understand what type of plants grow in your area, what type of sun/shade they need, and how much water they require.`,
    `Learn basic yard maintenance. Understand how to use a lawn mower (if you have a lawn) and hedge trimmers, as well as the proper way to pull weeds. Understand the safety issues of using chemicals to kill weeds and unwanted shrubs. If you do not have a yard to maintain, at least understand how to do it if you ever do.`,
    `Use AI tools responsibly to assist with a real task (planning, writing, research) and evaluate the accuracy of the results. Explain how AI can be biased or incorrect and why human judgment is still necessary.`,
  ],
};

// Map flat string arrays into the {type, text} shape the renderer expects.
function activitiesFromStrings(arr) {
  return arr.map((text) => ({ type: 'activity', text }));
}

const AWARDS = [
  {
    name: "Servant's Heart Award",
    slug: 'servants-heart',
    source_url: 'https://curiosityuntamed.com/servants-hearts/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/servants-heart-red.jpg',
    description: 'Earned by completing volunteer service hours at your level. A recognition of giving back to community and family.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has met the required service hours at their level.' },
  },
  {
    name: 'Life Skills Achievement Award',
    slug: 'life-skills',
    source_url: 'https://curiosityuntamed.com/life-skills-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/life-skill-award.jpg',
    description: 'Master practical skills across household chores, personal grooming, physical skills, safety, finances, navigation, and basic living. The award emphasizes ongoing proficiency, not just one-time completion.',
    award_type: 'task_list',
    award_config: {
      per_level: {
        preschool: activitiesFromStrings(LIFE_SKILLS_PER_LEVEL.preschool),
        level1:    activitiesFromStrings(LIFE_SKILLS_PER_LEVEL.level1),
        level2:    activitiesFromStrings(LIFE_SKILLS_PER_LEVEL.level2),
        level3:    activitiesFromStrings(LIFE_SKILLS_PER_LEVEL.level3),
        level4:    activitiesFromStrings(LIFE_SKILLS_PER_LEVEL.level4),
        level5:    activitiesFromStrings(LIFE_SKILLS_PER_LEVEL.level5),
      },
    },
  },
  {
    name: 'Discovery Award',
    slug: 'discovery',
    source_url: 'https://curiosityuntamed.com/discovery-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/discovery-award-pink.jpg',
    description: 'Earn at least one badge from each of the nine Areas of Discovery, all at the same age level.',
    award_type: 'area_coverage',
    award_config: {},
  },
  {
    name: 'WOW! Award',
    slug: 'wow',
    source_url: 'https://curiosityuntamed.com/wow-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/wow-yellow-blank.jpg',
    description: 'Earn 100 or more badges at a single age level — a celebration of breadth and dedication.',
    award_type: 'count_at_level',
    award_config: { min: 100 },
  },
  {
    name: 'Fruit of the Spirit Award',
    slug: 'fruit-of-the-spirit',
    source_url: 'https://curiosityuntamed.com/fruit-of-the-spirit-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/08/fruit-spirit-blue.jpg',
    description: 'Earn all nine character badges from the Quest Club code of conduct: Love, Joy, Peace, Patience, Kindness, Faithfulness, Gentleness, Goodness, and Self Control. Can be re-earned at each level.',
    award_type: 'specific_badges',
    award_config: {
      badge_names: ['Love', 'Joy', 'Peace', 'Patience', 'Kindness', 'Faith/Faithfulness', 'Gentleness', 'Goodness', 'Self Control'],
    },
  },
  {
    name: 'Liberty Award',
    slug: 'liberty',
    source_url: 'https://curiosityuntamed.com/liberty-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/Liberty-Award-3.png',
    description: 'Build civic literacy by earning five badges focused on American liberty and history.',
    award_type: 'specific_badges',
    award_config: {
      badge_names: ['U.S. Constitution', 'Elections', 'U.S. Government', 'U.S. History', 'Patriotism'],
    },
  },
  {
    name: 'Major Award',
    slug: 'major',
    source_url: 'https://curiosityuntamed.com/major-in-and-area-of-discovery/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/major-stars.png',
    description: 'Specialize in a single Area of Discovery by earning a large number of badges within it. Awarded per area, per level.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has majored in a chosen Area of Discovery at their level.' },
  },
  {
    name: 'Make a Difference Award',
    slug: 'make-a-difference',
    source_url: 'https://curiosityuntamed.com/make-a-difference-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/MAD-AWARD.jpg',
    description: 'Lead a community service project that makes a tangible difference. Required at each level except Preschool.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has led a community service project at their level.' },
  },
  {
    name: 'Leadership Award',
    slug: 'leadership',
    source_url: 'https://curiosityuntamed.com/awards/leadership-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/LEADERSHIP-AWARD.jpg',
    description: 'Recognizes leadership positions held and the character traits that make a leader. Earned per level except Preschool.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has held leadership positions at their level.' },
  },
  {
    name: 'Outdoors Award',
    slug: 'outdoors',
    source_url: 'https://curiosityuntamed.com/15243-2/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/outdoor-award.jpg',
    description: 'Develop age-appropriate outdoor skills across nature, safety, fire, navigation, and survival. Each level adds to the previous.',
    award_type: 'task_list',
    award_config: {
      // Curated from /15243-2/. Mix of specific badges and skill activities.
      per_level: {
        preschool: [
          { type: 'badge', name: 'Water Safety' },
          { type: 'badge', name: 'Outdoor Safety' },
          { type: 'badge', name: 'Camping' },
          { type: 'badge', name: 'Weather' },
          { type: 'badge', name: 'Fire Safety' },
          { type: 'badge', name: 'Leave No Trace' },
          { type: 'badge', name: 'First Aid' },
          { type: 'activity', text: 'Identify common plants, trees, and animals in your area.' },
          { type: 'activity', text: 'Go on a nature walk and notice 5 things you have not noticed before.' },
        ],
        level1: [
          { type: 'activity', text: 'Complete all Preschool requirements.' },
          { type: 'badge', name: 'Pocket Knife Safety' },
          { type: 'activity', text: 'Identify 3 cloud formations and what weather they predict.' },
          { type: 'activity', text: 'Take a 1-mile hike.' },
          { type: 'activity', text: 'Learn what to do if you get lost in the woods and how to use a whistle to signal for help.' },
        ],
        level2: [
          { type: 'activity', text: 'Complete all Level 1 requirements.' },
          { type: 'badge', name: 'Fire Building' },
          { type: 'badge', name: 'Outdoor Cooking' },
          { type: 'activity', text: 'Tie 5 useful knots and describe what each is used for.' },
          { type: 'activity', text: 'Learn the parts of a tent and help set one up.' },
          { type: 'activity', text: 'Assemble a basic survival bag.' },
          { type: 'activity', text: 'Demonstrate food-safety practices on a camping trip.' },
          { type: 'activity', text: 'Waterproof a pair of shoes or boots.' },
        ],
        level3: [
          { type: 'activity', text: 'Complete all Level 2 requirements.' },
          { type: 'activity', text: 'Start a fire without matches.' },
          { type: 'activity', text: 'Sharpen a knife.' },
          { type: 'activity', text: 'Prepare a backpack meal.' },
          { type: 'activity', text: 'Identify 10 edible vs. poisonous plants in your region.' },
          { type: 'activity', text: 'Take a 5+ mile hike.' },
          { type: 'activity', text: 'Camp 2 or more nights in a row.' },
          { type: 'activity', text: 'Use a compass to navigate a marked course.' },
          { type: 'activity', text: 'Identify and properly use 5 pieces of outdoor equipment.' },
          { type: 'activity', text: 'Learn and demonstrate 3 emergency signaling methods.' },
        ],
        level4: [
          { type: 'activity', text: 'Complete all Level 3 requirements.' },
          { type: 'activity', text: 'Sanitize water using 2 different methods.' },
          { type: 'activity', text: 'Describe step-by-step what to do for an injured hiker until help arrives.' },
        ],
        level5: [
          { type: 'activity', text: 'Complete all Level 4 requirements.' },
          { type: 'activity', text: 'Teach at least 6 outdoor skills to others (e.g. first aid, knot-tying, fire building, navigation).' },
        ],
      },
    },
  },
  {
    name: 'S.T.E.A.M. Award',
    slug: 'steam',
    source_url: 'https://curiosityuntamed.com/s-t-e-a-m-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/STEAM-AWARD.jpg',
    description: 'Explore Science, Technology, Engineering, Art, and Math through a curated mix of badges and creative projects. Complexity scales with age.',
    award_type: 'task_list',
    award_config: {
      // Steps apply at every level (complexity expectations scale with age).
      per_level: {
        all: [
          { type: 'badge', name: 'Math' },
          { type: 'activity', text: 'Earn 2 Life Science badges (e.g. Biology, Botany, Human Body).' },
          { type: 'activity', text: 'Earn 2 Physical Science badges (e.g. Physics, Electricity, Magnetism).' },
          { type: 'activity', text: 'Earn 2 Man Made Wonders badges.' },
          { type: 'activity', text: 'Earn 1 outdoor science badge.' },
          { type: 'activity', text: 'Earn 2 Art-area badges.' },
          { type: 'activity', text: 'Earn a Biography-type badge about a scientist, engineer, mathematician, or artist.' },
          { type: 'activity', text: 'Create a list of types of engineers and what they do.' },
          { type: 'activity', text: 'Create a list of types of scientists and what they do.' },
          { type: 'activity', text: 'Design a piece of technology that uses art to make it appealing.' },
          { type: 'activity', text: 'Analyze how the S.T.E.A.M. disciplines work together using 3 modern engineering examples (the older the participant, the deeper the analysis).' },
        ],
      },
    },
  },
  {
    name: 'Elizabeth Vicory Community Leadership Award',
    slug: 'elizabeth-vicory',
    source_url: 'https://curiosityuntamed.com/elizabeth-vicory-community-leadership-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/beth-award.jpg',
    description: 'Honors exceptional community leadership in memory of Elizabeth Vicory.',
    award_type: 'manual',
    award_config: { hint: 'Parent / leader confirms exceptional community leadership.' },
  },
  {
    name: 'Gem Award',
    slug: 'gem',
    source_url: 'https://curiosityuntamed.com/gem-awards/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/gem.jpg',
    description: 'The highest award at each level — earned by combining the Servant’s Heart, Make a Difference, Life Skills, Liberty, Fruit of the Spirit, Leadership, and Discovery awards.',
    award_type: 'composite',
    award_config: {
      award_slugs: ['servants-heart', 'make-a-difference', 'life-skills', 'liberty', 'fruit-of-the-spirit', 'leadership', 'discovery'],
    },
  },
  {
    name: 'Career Exploration Award',
    slug: 'career-exploration',
    source_url: 'https://curiosityuntamed.com/career-exploration-award/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2020/10/career-exploration-award-150x150-1.jpg',
    description: 'Explore career possibilities through structured research and reflection. Available at Levels 4 and 5 only.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms after the kid completes the career-exploration activities. Levels 4–5 only.' },
  },
  {
    name: 'Cassi Jensen Award',
    slug: 'cassi-jensen',
    source_url: 'https://curiosityuntamed.com/cassi-jensen-award-level-5-only/',
    image_url: 'https://curiosityuntamed.com/wp-content/uploads/2026/03/cassi-award.jpg',
    description: 'Awarded for earning every adult-level badge — the ultimate badge-library completion award. Level 5 only.',
    award_type: 'manual',
    award_config: { hint: 'Parent confirms when the kid has earned every adult-level badge. Level 5 only.' },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function basenameFromUrl(url) {
  const u = new URL(url);
  const path = u.pathname;
  const base = path.substring(path.lastIndexOf('/') + 1);
  // For award images we prefix with "award-" so they don't collide with badge images.
  return base.startsWith('award-') ? base : `award-${base}`;
}

async function downloadImage(url, destPath) {
  if (existsSync(destPath) && statSync(destPath).size > 0) return false; // already have it
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`Importing ${AWARDS.length} awards…`);

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(IMAGES_DEST, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const insertAward = db.prepare(`
  INSERT INTO badges (
    name, slug, category, author, image_file, is_specific, note, source_url,
    level_opt_counts, description, is_award, award_type, award_config
  ) VALUES (
    @name, @slug, 'Award', '', @image_file, 0, NULL, @source_url,
    '{}', @description, 1, @award_type, @award_config
  )
  ON CONFLICT(slug) DO UPDATE SET
    name         = excluded.name,
    image_file   = excluded.image_file,
    source_url   = excluded.source_url,
    description  = excluded.description,
    is_award     = 1,
    award_type   = excluded.award_type,
    award_config = excluded.award_config
`);

let inserted = 0;
let imgDownloaded = 0;
let imgSkipped = 0;

for (const a of AWARDS) {
  let imageFile = null;
  if (a.image_url) {
    imageFile = basenameFromUrl(a.image_url);
    const destPath = join(IMAGES_DEST, imageFile);
    try {
      const downloaded = await downloadImage(a.image_url, destPath);
      if (downloaded) { imgDownloaded++; console.log(`  ↓ ${imageFile}`); }
      else { imgSkipped++; }
    } catch (err) {
      console.warn(`  ! Image fetch failed for ${a.slug}: ${err.message}`);
      imageFile = null;
    }
  }

  insertAward.run({
    name: a.name,
    slug: a.slug,
    image_file: imageFile,
    source_url: a.source_url,
    description: a.description,
    award_type: a.award_type,
    award_config: JSON.stringify(a.award_config || {}),
  });
  inserted++;
}

console.log(`\nUpserted ${inserted} awards. Images: ${imgDownloaded} new, ${imgSkipped} already on disk.`);

// (No cropping for awards — their images are already final and varied in
// aspect ratio; the badge cropper is tuned for 500x500 originals with a
// colored outline ring that awards don't have.)

// ─── Stats ────────────────────────────────────────────────────────────────────

const counts = {
  total:   db.prepare(`SELECT COUNT(*) AS n FROM badges`).get().n,
  badges:  db.prepare(`SELECT COUNT(*) AS n FROM badges WHERE is_award = 0`).get().n,
  awards:  db.prepare(`SELECT COUNT(*) AS n FROM badges WHERE is_award = 1`).get().n,
};

console.log(`\nDatabase counts:`);
console.log(`  total badges row:  ${counts.total}`);
console.log(`  badges (is_award=0): ${counts.badges}`);
console.log(`  awards (is_award=1): ${counts.awards}`);

db.close();
console.log('\nAwards import complete.');
