import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve("courses/subject-showcase");

const lessons = [
  {
    slug: "engineering-resonance",
    area: "Engineering",
    courseCode: "MECHANICAL ENGINEERING",
    title: "Why Resonance Matters in Mechanical Systems",
    audience: "introductory engineering students",
    source: {
      id: "mit-resonance",
      title: "MIT OpenCourseWare: Introduction to Resonance",
      uri: "https://ocw.mit.edu/courses/18-03sc-differential-equations-fall-2011/3655af30412e2aebd0de0067925e8eb1_MIT18_03SCF11_s18_0intro.pdf",
      author: "MIT OpenCourseWare",
      content:
        "A driven oscillating system has a natural frequency. In the ideal undamped case, resonance occurs when the forcing frequency equals the natural frequency, producing a growing response. In practical systems damping limits the response and shifts how the resonant peak appears. Engineers use frequency response to understand how strongly a system reacts across forcing frequencies.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Start with a natural frequency",
        template: "showcase-resonance",
        visual:
          "Compare a small response away from the natural frequency with a large response near it.",
        claim:
          "A driven mechanical system responds differently as the forcing frequency approaches its natural frequency.",
        narration:
          "Every oscillating mechanical system has ways it naturally prefers to move. Push a swing slowly, or far too quickly, and the motion stays modest. Push near its natural rhythm and each input can reinforce the motion already underway. That frequency-sensitive amplification is the core idea behind resonance.",
      },
      {
        time: "0:22 - 0:46",
        title: "Read the resonant peak",
        template: "showcase-resonance",
        visual:
          "Trace amplitude against driving frequency and highlight the resonant region.",
        equation: "frequency ratio = driving frequency ÷ natural frequency",
        claim:
          "Frequency response shows how response amplitude changes with forcing frequency.",
        narration:
          "A frequency-response plot puts driving frequency on the horizontal axis and response amplitude on the vertical axis. The peak marks the resonant region. Its location and width tell engineers which excitations are most dangerous or most useful. A design does not merely ask whether a force exists; it asks how often that force repeats.",
      },
      {
        time: "0:46 - 1:12",
        title: "Use damping and separation",
        template: "showcase-resonance",
        visual:
          "Show damping lowering the peak and a design operating away from the resonant region.",
        claim:
          "Damping limits practical resonant response, and designers can reduce risk by changing damping or separating operating and natural frequencies.",
        narration:
          "Real systems lose energy through damping, so their response does not grow without bound. Engineers can add damping, change stiffness or mass, or keep operating speeds away from a troublesome natural frequency. The practical lesson is simple: resonance is not automatically failure, but ignoring the frequency relationship can turn a small repeating force into a large motion.",
      },
    ],
  },
  {
    slug: "engineering-technology-pid",
    area: "Engineering Technology",
    courseCode: "MECHATRONICS AND CONTROLS",
    title: "How a PID Controller Corrects an Error",
    audience: "introductory controls students",
    source: {
      id: "umich-pid",
      title: "Introduction: PID Controller Design",
      uri: "https://ctms.engin.umich.edu/CTMS/index.php?example=Introduction&section=ControlPID",
      author: "University of Michigan Control Tutorials",
      content:
        "A PID controller operates on the tracking error, the difference between a desired reference and the measured output. The proportional term responds to present error, the integral term accumulates error history, and the derivative term responds to the rate of change. The resulting control input drives the plant, the output is measured again, and the feedback loop repeats. Not every application needs all three terms.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Measure the tracking error",
        template: "showcase-pid",
        visual:
          "Subtract the measured output from the desired setpoint and feed the error to a controller.",
        equation: "e(t) = reference − measured output",
        claim:
          "A feedback controller begins with the difference between the desired and measured outputs.",
        narration:
          "Suppose a motor should hold one thousand revolutions per minute, but the sensor reports nine hundred. The controller does not command a correction from the target alone. It first computes tracking error: the desired output minus the measured output. Here, the error is positive one hundred revolutions per minute.",
      },
      {
        time: "0:22 - 0:48",
        title: "Combine present, past, and trend",
        template: "showcase-pid",
        visual:
          "Separate proportional, integral, and derivative contributions before combining them.",
        equation: "u(t) = Kp e(t) + Ki ∫e(t)dt + Kd de(t)/dt",
        claim:
          "The proportional, integral, and derivative terms use present error, accumulated error, and error rate respectively.",
        narration:
          "The proportional term reacts to the error right now. The integral term accumulates error over time, helping remove a persistent offset. The derivative term responds to how quickly error is changing, which can anticipate motion and reduce overshoot. Their weighted sum becomes the control input sent to the system.",
      },
      {
        time: "0:48 - 1:14",
        title: "Close the loop and tune carefully",
        template: "showcase-pid",
        visual:
          "Return the measured output through feedback and compare under-tuned and over-tuned responses.",
        claim:
          "The controller repeatedly measures the new output and updates its input, and a design may use only the terms it needs.",
        narration:
          "After the motor responds, the sensor measures again and the loop repeats. Larger gains are not automatically better: poor tuning can create overshoot, noise sensitivity, or oscillation. Engineers start with performance requirements, tune deliberately, and keep the controller as simple as the application allows. A PI controller may be enough when derivative action adds little value.",
      },
    ],
  },
  {
    slug: "science-spectroscopy",
    area: "Science",
    courseCode: "PHYSICS AND CHEMISTRY",
    title: "How Spectroscopy Identifies Matter",
    audience: "introductory science students",
    source: {
      id: "nist-spectroscopy",
      title: "Spectroscopy: A Measurement Powerhouse",
      uri: "https://www.nist.gov/spectroscopy/what-spectroscopy",
      author: "National Institute of Standards and Technology",
      content:
        "Atoms and molecules absorb and radiate light at characteristic frequencies. These sets of frequencies form spectral fingerprints that can reveal identity, composition, concentration, and temperature. In absorption spectroscopy, scientists measure which frequencies are missing after light interacts with a sample. NIST maintains reference spectral data and uses spectroscopy in fields including chemistry, atmospheric science, materials science, medicine, and astronomy.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Spread light into frequencies",
        template: "showcase-spectroscopy",
        visual:
          "Pass light through a sample and separate the transmitted light by wavelength.",
        claim:
          "Spectroscopy measures how matter absorbs or emits different frequencies of light.",
        narration:
          "White-looking light can contain many frequencies. A spectrometer separates those frequencies after light interacts with a sample. Instead of asking only how bright the light is, spectroscopy asks which frequencies are present, which are missing, and how strong each signal is.",
      },
      {
        time: "0:22 - 0:47",
        title: "Recognize a spectral fingerprint",
        template: "showcase-spectroscopy",
        visual:
          "Compare an unknown spectrum with reference line positions for known atoms or molecules.",
        claim:
          "Atoms and molecules have characteristic spectral patterns that can be compared with reference data.",
        narration:
          "Atoms and molecules do not interact with every frequency equally. Their internal energy structure produces characteristic patterns of absorption or emission. Those patterns act like spectral fingerprints. Matching the positions of measured peaks or missing bands with trusted reference data can identify substances in an unknown sample.",
      },
      {
        time: "0:47 - 1:12",
        title: "Interpret intensity with context",
        template: "showcase-spectroscopy",
        visual:
          "Use peak position for identity and calibrated signal strength for amount, with temperature and conditions noted.",
        claim:
          "Spectral measurements can reveal composition and concentration, but interpretation depends on measurement and excitation conditions.",
        narration:
          "Peak position can indicate identity, while calibrated signal strength can help estimate concentration. Conditions still matter: temperature, excitation, instrument response, and overlapping signals can change what is observed. Spectroscopy is powerful because it connects a precise measurement to reference physics, not because every colored line explains itself.",
      },
    ],
  },
  {
    slug: "art-design-hierarchy",
    area: "Art and Design",
    courseCode: "GRAPHIC DESIGN",
    title: "How Visual Hierarchy Guides Attention",
    audience: "introductory design students",
    source: {
      id: "ibm-hierarchy",
      title: "IBM Design Language: Tips and Techniques",
      uri: "https://www.ibm.com/design/language/layout/tips-and-techniques/",
      author: "IBM Design",
      content:
        "Visual hierarchy creates entry points and guides the eye from one element to another in order of significance. Typographic hierarchy uses size, style, and position to communicate reading order and parent-child relationships. Contrast, scale, alignment, whitespace, and consistent structure help people navigate complex information. Equally weighted elements can create a flat composition in which importance is difficult to discern.",
    },
    beats: [
      {
        time: "0:00 - 0:21",
        title: "Give the eye an entry point",
        template: "showcase-hierarchy",
        visual:
          "Compare a flat layout of equal elements with one dominant headline and clear supporting levels.",
        claim:
          "Visual hierarchy gives viewers an entry point and an order for scanning information.",
        narration:
          "When every element is equally loud, the viewer must decide where to begin. Visual hierarchy makes that decision intentional. One element becomes the entry point, supporting information follows, and details settle into a readable order. The design is not merely decorated; attention is being organized.",
      },
      {
        time: "0:21 - 0:46",
        title: "Build contrast with more than size",
        template: "showcase-hierarchy",
        visual:
          "Vary scale, weight, color, position, and whitespace while preserving alignment.",
        claim:
          "Scale, contrast, position, alignment, and whitespace can communicate relative importance.",
        narration:
          "A larger headline is one hierarchy cue, but not the only one. Weight, color, position, spacing, and alignment also shape what appears primary or secondary. Strong hierarchy uses a few coordinated differences. Random changes create noise; consistent differences create relationships that readers can learn quickly.",
      },
      {
        time: "0:46 - 1:10",
        title: "Test the reading path",
        template: "showcase-hierarchy",
        visual:
          "Trace the intended path from headline to context to action, then remove unnecessary competition.",
        claim:
          "Effective hierarchy guides the eye through information in order of significance.",
        narration:
          "To test a layout, look away and return for one second. What do you notice first, second, and third? If that order does not match the message, adjust the system rather than adding more emphasis everywhere. A successful hierarchy makes the important path feel natural while leaving the supporting material available.",
      },
    ],
  },
  {
    slug: "business-contribution-margin",
    area: "Business",
    courseCode: "MANAGERIAL ACCOUNTING",
    title: "How Contribution Margin Supports Decisions",
    audience: "introductory business students",
    source: {
      id: "openstax-contribution",
      title: "Explain Contribution Margin and Calculate Contribution Margin",
      uri: "https://openstax.org/books/principles-managerial-accounting/pages/3-1-explain-contribution-margin-and-calculate-contribution-margin-per-unit-contribution-margin-ratio-and-total-contribution-margin",
      author: "OpenStax",
      content:
        "Contribution margin is sales revenue minus variable costs. Per unit, it equals selling price per unit minus variable cost per unit. The contribution margin first covers fixed costs and then contributes to operating profit. The contribution margin ratio divides contribution margin per unit by selling price per unit and indicates how much of each sales dollar is available for fixed costs and profit. Cost-volume-profit analysis relies on assumptions including a relevant operating range.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Separate variable cost from price",
        template: "showcase-contribution-margin",
        visual:
          "Show a one-hundred-dollar sale minus sixty dollars of variable cost.",
        equation: "$100 selling price − $60 variable cost = $40 contribution margin",
        claim:
          "Unit contribution margin equals selling price per unit minus variable cost per unit.",
        narration:
          "Imagine a product sells for one hundred dollars and requires sixty dollars of variable cost for each unit. The forty-dollar difference is its unit contribution margin. It is not automatically profit. It is the amount that one additional sale contributes toward fixed costs and, after those are covered, operating profit.",
      },
      {
        time: "0:22 - 0:47",
        title: "Convert margin into a ratio",
        template: "showcase-contribution-margin",
        visual:
          "Divide the forty-dollar contribution by the one-hundred-dollar selling price.",
        equation: "$40 ÷ $100 = 40% contribution margin ratio",
        claim:
          "The contribution margin ratio expresses contribution margin as a percentage of sales.",
        narration:
          "Divide forty dollars by the one-hundred-dollar selling price and the contribution margin ratio is forty percent. That means forty cents of each sales dollar is available for fixed costs and then profit, under the model’s assumptions. Ratios make it easier to compare products with different prices.",
      },
      {
        time: "0:47 - 1:13",
        title: "Use the result within its assumptions",
        template: "showcase-contribution-margin",
        visual:
          "Compare product choices and mark the relevant range where price and cost assumptions remain valid.",
        claim:
          "Contribution margin supports cost-volume-profit decisions, but the analysis depends on assumptions about costs, prices, and operating range.",
        narration:
          "Managers use contribution margin to explore break-even volume, product mix, and the effect of changing price or variable cost. The result is only as good as the assumptions. Costs may change outside a relevant range, capacity may be limited, and demand may respond to price. Contribution margin is a decision model, not a substitute for context.",
      },
    ],
  },
  {
    slug: "liberal-arts-primary-sources",
    area: "Liberal Arts",
    courseCode: "HISTORY AND COMMUNICATION",
    title: "How to Evaluate a Historical Primary Source",
    audience: "introductory liberal arts students",
    source: {
      id: "loc-primary-sources",
      title: "Teacher's Guides and Primary Source Analysis Tool",
      uri: "https://www.loc.gov/programs/teachers/getting-started-with-primary-sources/guides/",
      author: "Library of Congress",
      content:
        "The Library of Congress primary source analysis process prompts learners to observe, reflect, question, and investigate further. Analysis begins with careful observations about the source before interpretation. Reflection connects observations with prior knowledge and considers purpose, audience, and context. Questions identify uncertainty and guide additional investigation. Comparing related sources can reveal differing perspectives and strengthen evidence-based interpretation.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Observe before interpreting",
        template: "showcase-primary-source",
        visual:
          "Annotate the date, creator, format, visible details, and exact wording without assigning motive yet.",
        claim:
          "Primary source analysis begins by recording careful observations about the source.",
        narration:
          "A primary source is evidence from the period or event being studied, but evidence does not interpret itself. Begin with observation. Record the creator, date, format, exact wording, and visible details. Separate what is actually present from what you expect or assume. That pause protects the analysis from starting with a conclusion.",
      },
      {
        time: "0:22 - 0:48",
        title: "Reflect on purpose and context",
        template: "showcase-primary-source",
        visual:
          "Place the source among creator, audience, purpose, historical setting, and what may be missing.",
        claim:
          "Reflection considers what the observations suggest about purpose, audience, and context.",
        narration:
          "Next, reflect. Who created the source, for whom, and for what purpose? What was happening at the time? What knowledge did the intended audience share? A speech, private letter, advertisement, and government report can describe the same event differently because their situations and goals differ.",
      },
      {
        time: "0:48 - 1:14",
        title: "Question and investigate further",
        template: "showcase-primary-source",
        visual:
          "Turn uncertainties into research questions and compare the item with related sources.",
        claim:
          "Questions and comparison with additional sources help test interpretations and identify differing perspectives.",
        narration:
          "Finally, turn uncertainty into questions. Which claims need corroboration? Whose perspective is absent? What related source could challenge this reading? Compare evidence before making a historical claim. Strong analysis does not ask whether a source is simply biased or unbiased. It asks how the source’s perspective affects what it can reliably show.",
      },
    ],
  },
  {
    slug: "health-oxygen-transport",
    area: "Health Sciences and Technology",
    courseCode: "ANATOMY AND PHYSIOLOGY",
    title: "How Oxygen Moves from Lungs to Tissue",
    audience: "introductory health science students",
    source: {
      id: "openstax-oxygen",
      title: "Transport of Gases",
      uri: "https://openstax.org/books/anatomy-and-physiology-2e/pages/22-5-transport-of-gases",
      author: "OpenStax",
      content:
        "Oxygen moves between alveolar air, blood, and tissues according to partial-pressure gradients. Most oxygen in blood is transported bound to hemoglobin inside erythrocytes, while a smaller portion is dissolved in plasma. In pulmonary capillaries oxygen loads onto hemoglobin. In systemic tissues, cellular oxygen use lowers local oxygen partial pressure and promotes unloading. Respiration supplies oxygen for cellular respiration and removes carbon dioxide.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Diffuse across the respiratory membrane",
        template: "showcase-oxygen",
        visual:
          "Move oxygen from alveolar air across the thin respiratory membrane into pulmonary blood.",
        claim:
          "Oxygen moves from alveolar air into pulmonary capillary blood along a partial-pressure gradient.",
        narration:
          "In the lungs, inhaled air reaches tiny alveoli beside pulmonary capillaries. Oxygen crosses the thin respiratory membrane because its partial pressure is higher in alveolar air than in the arriving blood. Diffusion continues toward equilibrium; the membrane does not actively pump oxygen into the bloodstream.",
      },
      {
        time: "0:22 - 0:46",
        title: "Load oxygen onto hemoglobin",
        template: "showcase-oxygen",
        visual:
          "Show oxygen entering red blood cells and binding to hemoglobin.",
        claim:
          "Most oxygen in blood is carried bound to hemoglobin within red blood cells.",
        narration:
          "Only a small amount of oxygen remains dissolved in plasma. Most enters red blood cells and binds reversibly to hemoglobin. This transport system greatly increases how much oxygen the blood can carry. Oxygenated blood then returns to the heart and is pumped through the systemic circulation.",
      },
      {
        time: "0:46 - 1:12",
        title: "Unload where tissues use oxygen",
        template: "showcase-oxygen",
        visual:
          "Follow oxygen from a systemic capillary into active tissue with a lower oxygen partial pressure.",
        claim:
          "Tissue oxygen use lowers local oxygen partial pressure and favors unloading from blood.",
        narration:
          "Active tissues consume oxygen during cellular respiration, lowering oxygen partial pressure around their cells. That gradient favors oxygen leaving the blood, separating from hemoglobin, and diffusing into tissue. The complete path is driven by linked gradients: ventilation refreshes alveolar air, circulation moves blood, and metabolism maintains demand.",
      },
    ],
  },
  {
    slug: "ntid-accessible-captions",
    area: "NTID and Accessibility",
    courseCode: "ACCESSIBLE MEDIA",
    title: "How Captions Improve an Educational Video",
    audience: "students and instructors creating course media",
    sources: [
      {
        id: "w3c-captions",
        title: "Understanding Captions (Prerecorded)",
        uri: "https://www.w3.org/WAI/WCAG20/Understanding/captions-prerecorded",
        author: "W3C Accessibility Guidelines Working Group",
        content:
          "WCAG requires captions for prerecorded audio content in synchronized media, except when the media is clearly a media alternative for text. Captions provide the audio information needed to understand the presentation. They include dialogue, speaker identification when needed, and meaningful non-speech sounds.",
      },
      {
        id: "rit-captioning",
        title: "RIT Center for Teaching and Learning: Captioning",
        uri: "https://www.rit.edu/teaching/captioning",
        author: "RIT Center for Teaching and Learning",
        content:
          "RIT states that accessible media should be planned when a course is designed. For instructor-created Panopto media, instructors can request professional captioning, generate and edit automatic captions, or manually create captions. Automatic captions need review and correction for accuracy. Professional captioning requires lead time.",
      },
    ],
    beats: [
      {
        time: "0:00 - 0:21",
        title: "Carry the meaning of the audio",
        template: "showcase-captions",
        visual:
          "Pair synchronized text with narration and a meaningful sound cue.",
        claim:
          "Captions convey dialogue and meaningful non-speech audio in synchronized media.",
        sourceIds: ["w3c-captions"],
        narration:
          "Captions are not decorative subtitles added at the end. They carry the information contained in the audio: spoken words, speaker identity when it matters, and meaningful sounds. A viewer should be able to follow the instructional message without relying on hearing the soundtrack.",
      },
      {
        time: "0:21 - 0:46",
        title: "Synchronize and edit for accuracy",
        template: "showcase-captions",
        visual:
          "Correct an automatic-caption error and align the revised cue with the spoken sentence.",
        claim:
          "Automatically generated captions require human review and correction for accuracy and timing.",
        sourceIds: ["rit-captioning"],
        narration:
          "Automatic speech recognition can create a useful first draft, but technical terms, names, punctuation, and timing often need correction. Review captions against the final audio, keep cues synchronized, and break lines at readable phrase boundaries. The reviewed caption file—not the raw machine output—belongs with the release.",
      },
      {
        time: "0:46 - 1:12",
        title: "Plan accessibility before release",
        template: "showcase-captions",
        visual:
          "Place caption and transcript work inside the production timeline before final approval.",
        claim:
          "RIT recommends planning accessible media during course design and provides captioning options for Panopto media.",
        sourceIds: ["rit-captioning", "w3c-captions"],
        narration:
          "Accessibility works best as a production requirement, not an emergency repair. RIT recommends planning accessible media while a course is designed and provides captioning options for Panopto content. Build review time into the schedule, keep a corrected transcript, and verify that visuals also communicate their essential meaning through narration or description.",
      },
    ],
  },
  {
    slug: "sustainability-lca",
    area: "Sustainability",
    courseCode: "LIFE-CYCLE ASSESSMENT",
    title: "How Life-Cycle Assessment Compares Products",
    audience: "introductory sustainability students",
    source: {
      id: "epa-lca",
      title: "Life Cycle Assessment: Principles and Practice",
      uri: "https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P1000L86.TXT",
      author: "U.S. Environmental Protection Agency",
      content:
        "Life-cycle assessment evaluates potential environmental impacts associated with a product, process, or service. The phased method includes goal and scope definition, inventory analysis, impact assessment, and interpretation. Scope identifies the system boundary and the effects to be considered. Inventory compiles energy and material inputs and environmental releases. A common functional unit is needed so alternatives provide an equivalent service for comparison.",
    },
    beats: [
      {
        time: "0:00 - 0:23",
        title: "Define an equivalent function",
        template: "showcase-lca",
        visual:
          "Compare two drink containers using the same functional unit rather than one arbitrary item.",
        claim:
          "A life-cycle comparison needs a functional unit that represents equivalent service.",
        narration:
          "To compare two products fairly, begin with the service they provide. One bottle versus one can may not be equivalent if their sizes or reuse patterns differ. A functional unit—such as delivering one thousand liters of beverage—creates a common basis for counting materials, energy, emissions, and waste.",
      },
      {
        time: "0:23 - 0:48",
        title: "Draw the system boundary",
        template: "showcase-lca",
        visual:
          "Enclose materials, manufacturing, transport, use, and end of life inside a stated boundary.",
        claim:
          "Goal and scope definition identifies the life-cycle stages and environmental effects included in the study.",
        narration:
          "Next, draw the system boundary. Does the study include raw-material extraction, manufacturing, transport, use, reuse, recycling, and disposal? Which environmental effects will be assessed? A result is only meaningful when the boundary and exclusions are visible, because moving a stage outside the analysis can move its impacts out of sight.",
      },
      {
        time: "0:48 - 1:15",
        title: "Inventory, assess, and interpret",
        template: "showcase-lca",
        visual:
          "Compile inputs and releases, connect them to impact categories, and compare trade-offs.",
        claim:
          "LCA compiles inventory flows, evaluates potential impacts, and interprets trade-offs within the stated scope.",
        narration:
          "The inventory records energy and material inputs plus environmental releases. Impact assessment connects those flows to potential consequences, and interpretation asks what drives the result and how uncertainty affects the decision. Life-cycle assessment rarely produces a universal winner. Its value is revealing trade-offs across the full system instead of optimizing one stage in isolation.",
      },
    ],
  },
  {
    slug: "individualized-study-question",
    area: "Individualized Study",
    courseCode: "INTERDISCIPLINARY LEARNING",
    title: "How to Shape an Interdisciplinary Study Question",
    audience: "students planning individualized or interdisciplinary study",
    source: {
      id: "rit-individualized",
      title: "What is Individualized Study?",
      uri: "https://www.rit.edu/individualizedstudy/what-individualized-study",
      author: "RIT School of Individualized Study",
      content:
        "RIT individualized study allows students whose interests do not fit neatly within a traditional degree to blend coursework around personal, professional, and career goals. Students work with academic advisors to identify interests and goals, select courses that build needed skills, connect with faculty, and map experiences such as co-op, internships, research, and study abroad. The result is an intentional plan of study rather than an unrelated collection of courses.",
    },
    beats: [
      {
        time: "0:00 - 0:22",
        title: "Begin with an outcome, not a course list",
        template: "showcase-interdisciplinary",
        visual:
          "Turn a broad interest into a concrete problem, audience, and desired outcome.",
        claim:
          "Individualized study is organized around a student’s interests, skills, and professional goals.",
        narration:
          "An interdisciplinary plan should not begin by collecting unrelated courses that sound interesting. Begin with an outcome. What problem do you want to address, for whom, and what would a successful result look like? A concrete outcome provides a reason for bringing multiple fields together.",
      },
      {
        time: "0:22 - 0:47",
        title: "Assign each discipline a job",
        template: "showcase-interdisciplinary",
        visual:
          "Map one field to technical capability, another to human context, and a shared project to integration.",
        claim:
          "Students can blend coursework from multiple areas to build a customized set of knowledge and skills.",
        narration:
          "Next, assign each discipline a job. One field might provide technical methods, another might explain human context, and a third might support design or evaluation. The connection must be explicit. If removing a field would not change the question or method, its role in the plan may not yet be clear.",
      },
      {
        time: "0:47 - 1:13",
        title: "Build an advised path to evidence",
        template: "showcase-interdisciplinary",
        visual:
          "Sequence foundational courses, methods, an integrating project, and experiential learning with advisor review.",
        claim:
          "RIT individualized-study students work with advisors to select courses and connect coursework with faculty and experiential learning.",
        narration:
          "Finally, sequence the learning. Identify foundations, methods, advanced work, and a project that forces the fields to interact. RIT individualized study pairs this planning with academic advising and connections to faculty and experiential learning. The goal is not maximum variety. It is an intentional path that produces evidence you can address the question.",
      },
    ],
  },
  {
    slug: "mathematics-local-derivative",
    area: "Mathematics",
    courseCode: "CALCULUS",
    title: "How a Derivative Captures Local Change",
    audience: "introductory calculus students",
    voice: "en-US-AvaMultilingualNeural",
    rate: "-8%",
    source: {
      id: "openstax-derivative",
      title: "OpenStax Calculus Volume 1: Defining the Derivative",
      uri: "https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative",
      author: "OpenStax",
      content:
        "A secant line through two points on a curve gives an average rate of change. As the second point approaches the first, the limiting secant slope defines the tangent-line slope when the limit exists. The derivative at a point is this limit of a difference quotient and represents an instantaneous rate of change. Near a differentiable point, the tangent line gives a useful local linear approximation.",
    },
    beats: [
      {
        time: "0:00 - 0:23",
        title: "Begin with an average slope",
        template: "showcase-derivative",
        visual:
          "Draw a curve with two nearby points and the secant line through them.",
        equation: "average slope = [f(a+h) − f(a)] ÷ h",
        claim:
          "The slope of a secant line measures average change between two points on a curve.",
        narration:
          "Choose a point at x equals a and a second point h units away. The line through them is a secant line. Its slope divides the change in function value by the change in input. That number describes average change across the interval, not yet what happens at one exact point.",
      },
      {
        time: "0:23 - 0:49",
        title: "Let the interval shrink",
        template: "showcase-derivative",
        visual:
          "Move the second point toward the first so the secant approaches a tangent.",
        equation: "f′(a) = lim h→0 [f(a+h) − f(a)] ÷ h",
        claim:
          "When the difference quotient approaches a limit as h approaches zero, that limit is the derivative at the point.",
        narration:
          "Now shrink h without setting it equal to zero. As the second point approaches the first, the secant lines approach a limiting position: the tangent line. If their slopes approach one finite value, that value is the derivative f prime of a. The limit turns nearby average change into instantaneous change.",
      },
      {
        time: "0:49 - 1:15",
        title: "Interpret the local model",
        template: "showcase-derivative",
        visual:
          "Compare positive, zero, and negative tangent slopes and show the tangent approximating the curve nearby.",
        claim:
          "The derivative gives the tangent slope and a local linear model of a differentiable function.",
        narration:
          "A positive derivative means the function is increasing locally; a negative derivative means it is decreasing; and a zero derivative gives a horizontal tangent. Close to the point, the tangent line can approximate the curve. The derivative is therefore both a geometric slope and a practical rate of change.",
      },
    ],
  },
  {
    slug: "cybersecurity-phishing-check",
    area: "Cybersecurity",
    courseCode: "SECURITY AWARENESS",
    title: "How to Check a Suspicious Message",
    audience: "students and staff learning cybersecurity fundamentals",
    voice: "en-US-AvaMultilingualNeural",
    rate: "-8%",
    source: {
      id: "cisa-phishing",
      title: "CISA Secure Our World: Phishing Tip Sheet",
      uri: "https://www.cisa.gov/sites/default/files/2024-09/Secure-Our-World-Phishing-Tip-Sheet.pdf",
      author: "Cybersecurity and Infrastructure Security Agency",
      content:
        "Phishing messages may arrive by email, text, direct message, or phone call and often imitate a trusted person or organization. Warning signs include urgent or emotional language, requests for personal information, shortened or untrusted links, and incorrect sender addresses. CISA advises people not to click suspicious links or attachments and to report and then delete suspected phishing messages.",
    },
    beats: [
      {
        time: "0:00 - 0:23",
        title: "Pause before acting",
        template: "showcase-phishing",
        visual:
          "Display a message with an urgent subject, unfamiliar sender domain, and unexpected link.",
        claim:
          "Phishing often uses urgency, impersonation, or unexpected requests to push a recipient into acting quickly.",
        narration:
          "A suspicious message tries to collapse the time between reading and acting. Pause. Look for urgency, emotional pressure, an unexpected attachment, a request for private information, or a sender address that only resembles the real organization. One red flag is not proof, but it is a reason to stop.",
      },
      {
        time: "0:23 - 0:49",
        title: "Verify through another path",
        template: "showcase-phishing",
        visual:
          "Move away from the message and open a known website or saved contact independently.",
        claim:
          "A suspicious request should be verified without using the links, attachments, or contact details supplied in the message.",
        narration:
          "Do not use the message itself to prove the message is legitimate. Instead, open the organization’s known website, use a saved phone number, or start a fresh message to a trusted contact. Check the full destination and sender carefully. Independent verification breaks the attacker’s control of the path.",
      },
      {
        time: "0:49 - 1:14",
        title: "Report, then remove",
        template: "showcase-phishing",
        visual:
          "Route the message to the organization’s reporting tool, then remove it without opening content.",
        claim:
          "CISA recommends reporting suspected phishing and deleting the message rather than engaging with it.",
        narration:
          "If the message remains suspicious, report it using your organization’s approved process or your email provider’s phishing control. Then delete it without opening links or attachments. Reporting helps defenders protect other recipients. The safe sequence is pause, verify independently, report, and remove.",
      },
    ],
  },
  {
    slug: "photography-exposure-triangle",
    area: "Photography",
    courseCode: "PHOTOGRAPHIC ARTS",
    title: "How the Exposure Triangle Shapes an Image",
    audience: "introductory photography students",
    voice: "en-US-AvaMultilingualNeural",
    rate: "-8%",
    source: {
      id: "adobe-exposure",
      title: "Adobe: What Is Exposure in Photography?",
      uri: "https://www.adobe.com/creativecloud/photography/discover/exposure-in-photography.html",
      author: "Adobe",
      content:
        "Photographic exposure is controlled through aperture, shutter speed, and ISO. Aperture changes the opening that admits light and also affects depth of field. Shutter speed controls how long light reaches the sensor and changes the appearance of motion. ISO changes the camera's sensitivity or signal amplification and can affect visible noise. The settings work together, so changing one may require compensation with another for a similar brightness.",
    },
    beats: [
      {
        time: "0:00 - 0:23",
        title: "Balance three controls",
        template: "showcase-exposure",
        visual:
          "Place aperture, shutter speed, and ISO at the corners of a balanced exposure triangle.",
        claim:
          "Aperture, shutter speed, and ISO work together to control photographic exposure.",
        narration:
          "Exposure is not one brightness dial. It is the combined result of aperture, shutter speed, and ISO. If one setting admits or records less light, another may need to compensate. The useful question is not only whether the image is bright enough, but what visual trade-off each setting creates.",
      },
      {
        time: "0:23 - 0:49",
        title: "Choose motion and depth",
        template: "showcase-exposure",
        visual:
          "Compare wide and narrow apertures beside fast and slow shutter examples.",
        claim:
          "Aperture affects depth of field, while shutter speed affects how motion is rendered.",
        narration:
          "A wider aperture admits more light and can produce shallower depth of field. A narrower aperture admits less light and can keep more of the scene in focus. A fast shutter can freeze motion; a slow shutter records motion across time. These are creative decisions as well as exposure decisions.",
      },
      {
        time: "0:49 - 1:15",
        title: "Use ISO deliberately",
        template: "showcase-exposure",
        visual:
          "Raise ISO to recover brightness while revealing increasing image noise.",
        claim:
          "ISO can help achieve a usable exposure when aperture and shutter constraints are fixed, but higher settings can increase visible noise.",
        narration:
          "When depth of field and motion already determine aperture and shutter speed, ISO can help reach a usable brightness. Raising it can also make noise more visible and reduce image quality. Start from the look the photograph needs, then balance the three controls instead of treating any one setting as automatically correct.",
      },
    ],
  },
  {
    slug: "psychology-correlation-causation",
    area: "Psychology",
    courseCode: "RESEARCH METHODS",
    title: "Why Correlation Is Not Causation",
    audience: "introductory psychology and research-methods students",
    voice: "en-US-AvaMultilingualNeural",
    rate: "-8%",
    source: {
      id: "openstax-correlation",
      title: "OpenStax Psychology 2e: Analyzing Findings",
      uri: "https://openstax.org/books/psychology-2e/pages/2-3-analyzing-findings",
      author: "OpenStax",
      content:
        "Correlation describes a relationship between variables and can indicate its direction and strength, but it does not by itself establish cause and effect. A third variable may influence both measured variables, creating a confounded association. Experiments use manipulation and control, including comparison groups and random assignment when appropriate, to support causal conclusions.",
    },
    beats: [
      {
        time: "0:00 - 0:23",
        title: "Describe the relationship",
        template: "showcase-correlation",
        visual:
          "Show a scatterplot in which two variables rise together without drawing a causal arrow.",
        claim:
          "Correlation describes the direction and strength of a relationship between variables.",
        narration:
          "When two measured variables change together, their data can show a correlation. A positive relationship means they tend to rise together; a negative relationship means one tends to fall as the other rises. Correlation describes a pattern. It does not yet explain why the pattern exists.",
      },
      {
        time: "0:23 - 0:49",
        title: "Look for a third variable",
        template: "showcase-correlation",
        visual:
          "Add temperature as a confounder pointing toward both ice-cream sales and reported crime.",
        claim:
          "A confounding variable can influence both measured variables and create an association without direct causation.",
        narration:
          "Ice-cream sales and reported crime can both rise during hot weather. That does not mean buying ice cream causes crime. Temperature changes behavior in ways that can affect both measurements. This third-variable problem is one reason an observed relationship cannot establish a causal direction on its own.",
      },
      {
        time: "0:49 - 1:15",
        title: "Match the claim to the design",
        template: "showcase-correlation",
        visual:
          "Separate an observational study from a controlled experiment with manipulation and comparison.",
        claim:
          "Causal claims require a research design that can rule out plausible alternatives, typically through experimental manipulation and control.",
        narration:
          "To support a causal claim, researchers need a design that manipulates an independent variable and controls competing explanations, often with comparison groups and random assignment. Observational correlations remain valuable for prediction and discovery. The professional habit is to make a claim no stronger than the study design allows.",
      },
    ],
  },
];

function configFor(lesson) {
  return {
    schemaVersion: 1,
    preset: "rit-course",
    project: {
      id: `showcase-${lesson.slug}`,
      title: lesson.title,
      owner: "Kenju Tomita",
      courseCode: lesson.courseCode,
      department: "RIT AI Club",
      audience: lesson.audience,
    },
    dataPolicy: {
      classification: "public",
      hostedConsent: true,
      allowedHostedProviders: ["edge-narration"],
    },
    providers: {
      "edge-narration": {
        adapter: "edge-tts",
        executionLocation: "hosted",
        model: "edge-tts-7.2.8",
        voice: lesson.voice || "en-US-AndrewMultilingualNeural",
        rate: lesson.rate || "+8%",
        pitch: "+0Hz",
      },
    },
    roles: {
      narration: {
        primary: "edge-narration",
        fallbacks: [],
      },
    },
    workflow: {
      groundingMode: "source-pack",
      determinism: "record",
      approvals: [],
      outputRoot: `.demo-output/subject-showcase/${lesson.slug}`,
      cacheRoot: ".video-cache/v2",
      maxCostUsd: 0,
      allowUnknownCost: false,
    },
    brandPack: null,
  };
}

function sourcesFor(lesson) {
  const sources = lesson.sources || [lesson.source];
  return {
    sources: sources.map((source) => ({
      ...source,
      type: "url",
      verified: true,
    })),
  };
}

function storyboardFor(lesson) {
  const defaultSourceId = (lesson.sources || [lesson.source])[0].id;
  return [
    `# ${lesson.title}`,
    "",
    ...lesson.beats.flatMap((beat) => {
      const sourceIds = beat.sourceIds || [defaultSourceId];
      return [
        `## ${beat.time} — ${beat.title}`,
        "",
        `**[VISUAL]** template:${beat.template} | ${beat.visual}`,
        ...(beat.equation ? [`**[EQUATION]** ${beat.equation}`] : []),
        `**[CLAIM ${sourceIds.join(",")}]** ${beat.claim}`,
        "",
        "**[VOICEOVER]**",
        "",
        beat.narration,
        "",
        "**Delivery:** Professional, concise, and paced for an introductory course audience.",
        "",
      ];
    }),
  ].join("\n");
}

for (const lesson of lessons) {
  const directory = join(root, lesson.slug);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      join(directory, "video.config.json"),
      `${JSON.stringify(configFor(lesson), null, 2)}\n`,
    ),
    writeFile(
      join(directory, "sources.json"),
      `${JSON.stringify(sourcesFor(lesson), null, 2)}\n`,
    ),
    writeFile(join(directory, "storyboard.md"), storyboardFor(lesson)),
  ]);
}

const readme = `# RIT academic-area subject showcase

This directory contains ${lessons.length} source-grounded course-draft
examples spanning major RIT academic areas. The computer-architecture
reference master remains in \`courses/computer-architecture\`.

These are **draft demonstrations**, not instructor-approved course releases.
They use public, authoritative source packs, deterministic SVG templates,
Edge TTS narration, closed captions, and the RIT course quality profile without
official logos or licensed brand assets. Script, visual, accessibility, and
release review are still required before any example is presented as approved
course content.

Generate the inputs with:

\`\`\`bash
node scripts/create-subject-showcase.mjs
\`\`\`

Render one example with:

\`\`\`bash
npm run rit-video -- plan \\
  --config courses/subject-showcase/science-spectroscopy/video.config.json \\
  --storyboard courses/subject-showcase/science-spectroscopy/storyboard.md \\
  --sources courses/subject-showcase/science-spectroscopy/sources.json
npm run rit-video -- produce \\
  --config courses/subject-showcase/science-spectroscopy/video.config.json \\
  --mode record --until render
\`\`\`

The batch helper is \`scripts/render-subject-showcase.mjs\`.
`;
await writeFile(join(root, "README.md"), readme);

console.log(
  JSON.stringify(
    {
      root,
      created: lessons.length,
      lessons: lessons.map(({ slug, area, title }) => ({ slug, area, title })),
    },
    null,
    2,
  ),
);
