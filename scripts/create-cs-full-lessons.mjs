import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve("courses/long-form-lessons");

const lessons = [
  {
    slug: "programming-foundations",
    template: "showcase-programming",
    title: "Programming Foundations: From Problem to Tested Program",
    subject: "Programming Fundamentals",
    description:
      "Build a reliable program from inputs, variables, control flow, functions, collections, errors, tests, and decomposition.",
    outcomes: [
      "Translate a problem into data, operations, and control flow",
      "Use functions and collections to organize a program",
      "Test behavior systematically and diagnose failures"
    ],
    sources: [
      {
        id: "python-tutorial",
        title: "The Python Tutorial",
        uri: "https://docs.python.org/3/tutorial/index.html",
        author: "Python Software Foundation",
        content:
          "The official Python tutorial introduces expressions, variables, control flow, functions, data structures, modules, input and output, errors, exceptions, classes, and standard-library tools. Lists, tuples, sets, and dictionaries represent different collection behaviors. Functions group reusable behavior and accept parameters. Exceptions separate error handling from normal control flow.",
      },
      {
        id: "python-control",
        title: "More Control Flow Tools",
        uri: "https://docs.python.org/3/tutorial/controlflow.html",
        author: "Python Software Foundation",
        content:
          "Python control flow includes conditional statements, for and while loops, range iteration, loop control, pattern matching, and function definitions. Function parameters, return values, documentation strings, and coding style support readable decomposition. Control structures should express the decision and repetition required by the problem.",
      },
    ],
    beats: [
      ["Define the computational problem", "Turn a word problem into explicit inputs, required outputs, constraints, and examples.", "A program should be designed from a precise input-output contract and representative examples.", ["python-tutorial"], "Programming begins before code. Start by stating what information enters the program, what result must leave it, and which constraints must always hold. For a grade calculator, inputs may be scores and weights; the output may be a numeric average and category. Write ordinary examples, boundary examples, and invalid examples. This creates a behavioral contract that can be checked independently of syntax. Then identify the transformations between input and output. A clear contract prevents a common failure: writing statements that run without knowing whether they solve the intended problem. Code is an executable representation of a model, so the model must be understandable first."],
      ["Represent values and state", "Show names referring to numbers, text, Boolean values, and collections as program state changes.", "Variables bind names to values, and the chosen data representation determines which operations are natural and safe.", ["python-tutorial"], "A program stores information as values. Numbers support arithmetic, strings represent text, Boolean values represent true-or-false conditions, and collections group related values. A variable is a name bound to a value, not a permanent box with one fixed meaning. Assignment changes which value a name refers to. Good names express the role of the data: total cost is clearer than t. Representation choices affect the rest of the design. A date stored as one ambiguous string is harder to validate than separate year, month, and day values. Ask what operations the program needs, what invalid states are possible, and which representation makes correct behavior easiest to express."],
      ["Build expressions deliberately", "Trace an expression tree through arithmetic, comparisons, Boolean operators, and operator precedence.", "Expressions combine values and operators to produce new values, and parentheses can make intended evaluation explicit.", ["python-tutorial"], "Expressions compute values. Arithmetic operators combine numbers; comparison operators produce Boolean results; Boolean operators combine conditions. Evaluation order matters. Multiplication normally occurs before addition, but parentheses make the intended grouping explicit and easier to review. Avoid packing an entire algorithm into one clever expression. Intermediate names can expose meaning and provide places to inspect behavior. Types matter too: adding numbers differs from concatenating text, and converting user input should be deliberate. When an expression behaves unexpectedly, evaluate it from the inside outward, inspect each intermediate value, and confirm that the data type and unit match the intended calculation."],
      ["Control decisions with conditions", "Route one input through mutually exclusive branches and show how ordering changes the selected result.", "Conditional statements select behavior according to Boolean conditions, with branch order determining which matching case runs.", ["python-control"], "A conditional represents a decision. Each condition should correspond to a meaningful rule in the problem. Order matters when ranges overlap. In a grading rule, check the highest threshold first or express non-overlapping intervals explicitly. Include a final else only when a meaningful default or invalid case exists. Deeply nested conditions are difficult to reason about, so simplify repeated tests and extract named helper functions when a decision has its own concept. Test conditions at boundaries: exactly zero, exactly the threshold, just below, and just above. A condition is correct only when both the true path and the false path match the specification."],
      ["Use loops with an invariant", "Step through repeated processing while highlighting initialization, update, termination, and the accumulated result.", "A loop repeats an operation while maintaining a condition that connects completed work with remaining work.", ["python-control"], "Loops express repetition. A for loop naturally processes each item in a collection, while a while loop repeats until a condition changes. Every loop needs a clear initialization, update, and termination argument. An invariant describes what remains true after each iteration. In a running total, the invariant may be that total equals the sum of all items processed so far. This idea makes loops easier to prove and debug. Watch for off-by-one errors, empty collections, and updates that never occur. Print tracing can help during development, but a final design should make the loop’s purpose visible through names and structure rather than relying on debugging output."],
      ["Decompose behavior into functions", "Separate input validation, computation, and formatting into small functions connected by explicit parameters and returns.", "Functions package reusable behavior behind parameters and return values, supporting decomposition and testing.", ["python-control"], "A function gives one piece of behavior a name and a boundary. Parameters describe what the function needs; the return value describes what it produces. Prefer a function that completes one coherent responsibility over a long function that reads input, calculates, prints, modifies global state, and handles every error at once. Pure calculation functions are especially easy to test because the same inputs produce the same outputs without hidden dependencies. Avoid using global variables when a parameter or return value would make the dependency explicit. Good decomposition follows concepts in the problem: validate score, compute weighted average, and format result are meaningful units that can be reviewed separately."],
      ["Choose a collection by behavior", "Compare ordered lists, immutable tuples, unique sets, and key-value dictionaries with the operations each supports.", "Lists, tuples, sets, and dictionaries provide different ordering, mutability, uniqueness, and lookup behavior.", ["python-tutorial"], "Collections are not interchangeable containers. A list preserves order and can contain repeated values. A tuple represents an ordered grouping that is not changed in place. A set emphasizes membership and uniqueness. A dictionary maps keys to values for direct lookup. Choose according to the operations the problem requires. If student records are repeatedly retrieved by identifier, a dictionary may express the relationship better than scanning a list. If order matters, a set alone is insufficient. Consider empty collections, duplicate keys or values, and whether mutation should be allowed. Representation is part of algorithm design because it determines both clarity and performance."],
      ["Handle invalid input and exceptions", "Separate normal computation from validation failures and unexpected exceptional paths.", "Exceptions communicate that normal execution could not continue, while validation prevents predictable invalid states from entering the computation.", ["python-tutorial"], "Programs interact with files, users, networks, and data that may be missing or malformed. Validate predictable constraints close to the boundary: required fields, numeric ranges, and allowed choices. Exceptions handle operations that fail despite the intended call, such as converting nonnumeric text or opening a missing file. Catch only exceptions the program can respond to meaningfully. A broad catch that silently continues can hide defects and corrupt results. Error messages should explain what failed and what the user can do next without exposing secrets. Separate the normal path from recovery so that correct behavior remains readable. Robustness is not the absence of errors; it is controlled, observable behavior when errors occur."],
      ["Test examples, boundaries, and properties", "Turn the original examples into automated tests and add boundary, invalid, and repeated-run checks.", "Systematic tests compare observed results with expected behavior across normal, boundary, and invalid cases.", ["python-tutorial"], "Testing converts the behavioral contract into repeatable evidence. Begin with a small normal case whose answer can be calculated by hand. Add boundary cases, such as an empty collection, one item, the maximum allowed value, and values immediately around a threshold. Add invalid cases and confirm the intended error. Each test should identify one behavior and produce a clear failure when that behavior changes. Tests do not prove the absence of every defect, but they protect known requirements and make refactoring safer. When a defect is found, first create a test that reproduces it, then repair the code and keep the test as a permanent regression check."],
      ["Use a complete programming workflow", "Summarize contract, representation, small steps, decomposition, validation, tests, and revision in one loop.", "Reliable programming combines problem modeling, explicit data representation, structured control flow, decomposition, and evidence from tests.", ["python-tutorial", "python-control"], "A dependable workflow is iterative. Define inputs, outputs, constraints, and examples. Choose representations that support the required operations. Write the smallest correct step and observe it. Add conditions and loops with explicit reasoning. Extract functions around coherent responsibilities. Validate external input and handle recoverable failures. Turn examples and boundaries into automated tests. Then revise names and structure without changing behavior. This process scales better than writing the whole program and debugging at the end. Syntax makes instructions executable, but reliability comes from the chain of reasoning that connects the original problem to data, control flow, functions, tests, and a result another person can understand. Before calling the program complete, ask another person to run one normal example and one failure case from the written contract. Their questions often reveal hidden assumptions about units, input format, or expected output. Record those assumptions as validation rules, documentation, or tests so the next revision begins with stronger evidence."],
    ],
  },
  {
    slug: "algorithm-analysis",
    template: "showcase-algorithms",
    title: "Algorithm Analysis: Correctness, Growth, and Tradeoffs",
    subject: "Analysis of Algorithms",
    description:
      "Analyze algorithms through correctness, models of computation, asymptotic growth, loops, recurrences, data structures, and empirical validation.",
    outcomes: [
      "Use asymptotic notation to compare growth rates",
      "Analyze iterative and recursive algorithms",
      "Connect correctness and performance claims to assumptions"
    ],
    sources: [
      {
        id: "mit-6006",
        title: "MIT OpenCourseWare 6.006: Introduction to Algorithms",
        uri: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/",
        author: "MIT OpenCourseWare",
        content:
          "MIT 6.006 introduces mathematical modeling of computational problems, data structures, algorithmic paradigms, performance measures, and analysis techniques. It emphasizes the relationship between algorithms and programming and the use of a model of computation for rigorous performance claims.",
      },
      {
        id: "mit-review",
        title: "MIT 6.006 Lecture 20: Course Review",
        uri: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/aa4f264093faf990054cc4820553bb46_MIT6_006S20_lec20.pdf",
        author: "MIT OpenCourseWare",
        content:
          "Algorithm analysis argues correctness and evaluates efficiency using asymptotics and an explicit model of computation. Common techniques include direct counting, recurrences, divide and conquer, dynamic programming, greedy reasoning, graph algorithms, and data-structure augmentation.",
      },
    ],
    beats: [
      ["Separate the problem from the algorithm", "Place one problem specification above multiple candidate algorithms and implementations.", "A computational problem defines required input-output behavior, while an algorithm is a procedure intended to produce that behavior.", ["mit-6006"], "Algorithm analysis begins by separating three layers. The problem states the required relationship between inputs and outputs. An algorithm is a language-independent procedure for producing the output. An implementation expresses that procedure in a programming language and on a machine. Two programs may implement the same algorithm, and two algorithms may solve the same problem with very different costs. State assumptions about input size, allowed operations, and required correctness before comparing performance. Otherwise a faster-looking program may be solving an easier problem or relying on an operation whose cost has been ignored. Analysis makes comparisons meaningful by fixing the question first."],
      ["Establish correctness before speed", "Trace a candidate algorithm through preconditions, invariant, postcondition, and a counterexample search.", "An efficient algorithm is useful only if it satisfies the required behavior for every allowed input.", ["mit-review"], "Performance cannot rescue an incorrect result. A correctness argument begins with preconditions describing allowed inputs and a postcondition describing the required output. For iterative algorithms, a loop invariant connects the work already completed to the work that remains. Show that the invariant is true initially, preserved by each iteration, and strong enough to imply the postcondition at termination. For recursive algorithms, prove the base case and show that correct solutions to smaller subproblems produce a correct larger solution. Test examples help find counterexamples, but a proof explains why every allowed case works. Correctness and performance are separate claims, and both need evidence."],
      ["Choose a model and input size", "Count primitive operations while contrasting array access, comparison, hashing, and large-number arithmetic assumptions.", "Running-time analysis depends on a defined input-size measure and a model assigning costs to operations.", ["mit-6006", "mit-review"], "To analyze cost, define n. It may be the number of array elements, graph vertices and edges, digits in an integer, or dimensions of a matrix. Then define which operations count as constant time in the chosen model. Array access and machine-word arithmetic may be constant under a random-access model, but arithmetic on integers with thousands of digits is not. Hash-table lookup is commonly expected constant time under assumptions, not guaranteed constant time for every input. State these choices. An asymptotic result without an input measure or model is incomplete. The model is an abstraction, but a useful abstraction exposes dominant structure while remaining connected to implementation reality."],
      ["Interpret O, Omega, and Theta", "Bound one growth curve from above and below after a threshold and distinguish the three symbols.", "Big O gives an asymptotic upper bound, Omega a lower bound, and Theta a matching upper and lower bound.", ["mit-6006", "mit-review"], "Asymptotic notation describes growth beyond a sufficiently large input. Big O is an upper bound: after some threshold, the cost is no more than a constant multiple of the comparison function. Omega is a lower bound. Theta states both and therefore gives a tight growth class. Big O is not automatically worst case; worst, average, and best case describe which inputs are considered, while O describes a bound. A function in Theta of n is also in O of n squared, but the looser statement hides information. Use the tightest justified class and state which case is being analyzed. Constants and lower-order terms disappear asymptotically, not because they never matter, but because growth eventually dominates."],
      ["Order common growth rates", "Plot constant, logarithmic, linear, n log n, quadratic, and exponential curves on the same scale.", "Common algorithmic growth classes differ dramatically as input size increases.", ["mit-6006"], "Constant, logarithmic, linear, n log n, quadratic, polynomial, and exponential growth describe very different scaling. Doubling n barely changes a logarithmic cost, doubles a linear cost, roughly doubles plus an additional factor for n log n, quadruples a quadratic cost, and can multiply an exponential cost enormously. This ordering guides design choices before low-level optimization. A carefully optimized quadratic algorithm can beat a linear one on tiny inputs, but as n grows the growth-rate advantage eventually dominates. Use realistic input ranges and memory constraints too. Asymptotics predict scaling; they do not replace measurement or permit ignoring large constants when the deployment range is known."],
      ["Analyze loops by counting work", "Expand single, nested, dependent, and halving loops into summations and growth classes.", "Loop cost is the sum of work across iterations, and nested loops are not automatically quadratic.", ["mit-review"], "For a loop, count how many times the body runs and the cost of each run. A loop from zero to n minus one with constant body work is linear. Two independent loops in sequence add, so linear plus linear remains linear. Perfectly nested loops of n iterations multiply to n squared. But bounds may depend on the outer index, producing a sum such as one plus two through n, still Theta n squared. A loop that repeatedly halves the remaining size is logarithmic. Read the update and bounds rather than counting indentation. If the body calls another algorithm, include that cost. Writing the sum explicitly often turns intuition into a defensible result."],
      ["Analyze recursion with recurrences", "Split a problem into subproblems, add combination work, and unfold the recurrence as a tree.", "A recurrence expresses recursive running time as subproblem costs plus nonrecursive work.", ["mit-review"], "A recursive algorithm’s cost can be modeled with a recurrence. Merge sort divides an input into two halves, recursively sorts each half, and performs linear merging, giving T of n equals two T of n over two plus Theta n. A recursion tree shows logarithmically many levels with linear total work per level, producing Theta n log n. Other recurrences behave differently depending on the number and size of subproblems and the combination cost. State a base case and avoid applying a memorized theorem without checking its conditions. Recurrences are not only algebra; they mirror the structure of the algorithm and reveal where the work accumulates."],
      ["Include data-structure operations", "Run the same task through arrays, balanced trees, hash tables, heaps, and graphs with labeled operation costs.", "Algorithm performance depends on the data structure supplying required operations and their cost guarantees.", ["mit-6006"], "An algorithm is often a sequence of data-structure operations. Searching an unsorted array is linear, while a balanced search tree can support logarithmic lookup and ordered traversal. A hash table can provide expected constant-time lookup under assumptions but does not preserve sorted order. A heap makes repeated minimum extraction efficient without supporting every search efficiently. The right structure follows the operations the problem performs most often, the guarantees it requires, and the memory it can afford. Include construction cost, not just query cost. A structure that accelerates one operation may slow updates or use more space. Time-space tradeoffs are algorithmic choices, not afterthoughts."],
      ["Measure without confusing measurement and proof", "Compare predicted growth with benchmark curves while controlling input, warm-up, environment, and repeated trials.", "Empirical timing validates implementation behavior over measured inputs but does not replace asymptotic reasoning or correctness.", ["mit-6006", "mit-review"], "Benchmarks reveal constants, cache behavior, interpreter overhead, input distributions, and implementation defects that an abstract model omits. Measure representative inputs, vary n systematically, repeat trials, and record the environment. Avoid timing unrelated setup unless it is part of the operation being evaluated. Plot time against candidate growth functions and investigate discrepancies. A benchmark on five sizes cannot prove asymptotic complexity, and an asymptotic proof cannot predict an exact runtime on one laptop. Use both forms of evidence. Analysis explains expected scaling under a model; measurement checks how a particular implementation and workload behave in reality."],
      ["Use a complete analysis checklist", "Summarize specification, correctness, size, model, case, bound, space, and measurement.", "A professional algorithm analysis states the problem, proves correctness, defines assumptions, derives cost, and validates relevant implementation behavior.", ["mit-6006", "mit-review"], "A complete analysis answers eight questions. What problem and input domain are being solved? Why is the algorithm correct? What quantity defines input size? Which model assigns costs to operations? Are we discussing worst, average, expected, amortized, or best case? What tight time and space bounds follow? Which data-structure assumptions support those bounds? What do measurements show over the intended range? This checklist prevents Big O from becoming a decorative label. The goal is an argument another person can inspect: the algorithm returns the right answer, the derivation follows its structure, the assumptions are visible, and the measured implementation behaves consistently with the claim."],
    ],
  },
  {
    slug: "relational-data-management",
    template: "showcase-database",
    title: "Relational Data Management: Design, Query, and Transactions",
    subject: "Principles of Data Management",
    description:
      "Move from relational tables and keys through SQL queries, joins, constraints, normalization, indexes, transactions, and query reasoning.",
    outcomes: [
      "Design tables with keys and integrity constraints",
      "Construct and reason about relational queries and joins",
      "Explain indexes and transaction boundaries"
    ],
    sources: [
      {
        id: "postgres-tutorial",
        title: "PostgreSQL Tutorial: The SQL Language",
        uri: "https://www.postgresql.org/docs/current/tutorial-sql.html",
        author: "PostgreSQL Global Development Group",
        content:
          "The PostgreSQL SQL tutorial covers relational concepts, creating and populating tables, queries, joins, aggregates, updates, and deletions. Tables contain rows and columns; SQL statements define, query, and modify relations. Foreign keys and transactions support integrity across related operations.",
      },
      {
        id: "postgres-advanced",
        title: "PostgreSQL Tutorial: Advanced Features",
        uri: "https://www.postgresql.org/docs/current/tutorial-advanced.html",
        author: "PostgreSQL Global Development Group",
        content:
          "PostgreSQL advanced tutorial material introduces views, foreign keys, transactions, and window functions. Transactions group statements into all-or-nothing units using BEGIN, COMMIT, and ROLLBACK. Constraints and foreign keys preserve declared relationships.",
      },
      {
        id: "postgres-index",
        title: "PostgreSQL CREATE INDEX",
        uri: "https://www.postgresql.org/docs/current/sql-createindex.html",
        author: "PostgreSQL Global Development Group",
        content:
          "Indexes are primarily used to enhance database performance, though inappropriate indexes can slow modification and consume resources. Index definitions select columns or expressions and may enforce uniqueness. Query planning determines whether an index is useful for a particular operation.",
      },
    ],
    beats: [
      ["Model data as relations", "Turn an application spreadsheet into named tables with rows, columns, and declared meanings.", "The relational model represents data in relations whose attributes and tuples have defined meaning.", ["postgres-tutorial"], "Data management begins with a model, not a query. A relation is commonly presented as a table. Columns represent attributes with defined domains, and rows represent tuples describing instances. A students table might contain a student identifier and name; an enrollments table can represent the relationship between students and course sections. Every column needs one meaning, one unit, and an appropriate type. Avoid storing several values in one cell or repeating groups of columns. A schema is a contract about the shape and interpretation of stored data. If the meaning is ambiguous, technically valid SQL can still produce meaningless results."],
      ["Use keys to identify and connect", "Highlight primary keys, candidate keys, and foreign keys across related tables.", "Primary keys identify rows, while foreign keys represent references to rows in another relation.", ["postgres-advanced", "postgres-tutorial"], "A key is an attribute or minimal set of attributes that uniquely identifies a row. A table may have several candidate keys; one is selected as the primary key. Stable generated identifiers are often useful, but a generated key does not remove the need to enforce real-world uniqueness when required. A foreign key stores a value that must match a referenced key, representing a declared relationship. An enrollment can reference one student and one section. Foreign-key constraints prevent orphaned references, but designers must choose what should happen when referenced data changes or is deleted. Keys give relationships executable structure rather than leaving them as comments or naming conventions."],
      ["Declare types and constraints", "Reject invalid rows using data types, NOT NULL, CHECK, UNIQUE, primary-key, and foreign-key constraints.", "Database constraints prevent states that violate declared structural and business rules.", ["postgres-tutorial", "postgres-advanced"], "Types define which values a column can represent. Constraints narrow those values to the valid states of the application. Not null requires a value. Check constraints express conditions such as a nonnegative quantity. Unique constraints prevent duplicates. Primary and foreign keys enforce identity and references. Put durable invariants in the database when every application must obey them. Validation in a user interface improves feedback, but it can be bypassed by another client or import. Constraints also need careful scope: a rule involving current time or external state may not behave like a stable row invariant. Good constraints make invalid data difficult to store and failures explicit."],
      ["Query with select, filter, and projection", "Build a SELECT statement from source tables, WHERE conditions, selected columns, expressions, and ordering.", "A SQL query derives a result relation by selecting sources, filtering rows, and projecting expressions.", ["postgres-tutorial"], "A basic select statement identifies source tables, filters rows with a where condition, and projects the columns or expressions to return. The result is itself a table-like relation. SQL describes the desired result more than a step-by-step loop, allowing the database to choose an execution plan. Be precise about null: it represents missing or unknown information and does not behave like an ordinary value in comparisons. Use IS NULL rather than equals null. Ordering is not guaranteed unless an ORDER BY clause requests it. Select only needed columns, use meaningful aliases, and verify the result on a tiny hand-checkable dataset before trusting a large output."],
      ["Join related tables correctly", "Match enrollment foreign keys to student and section primary keys, then contrast inner and outer joins.", "A join combines rows according to a predicate, and an incorrect or missing predicate can multiply unrelated rows.", ["postgres-tutorial"], "Joins reconstruct relationships stored across tables. An inner join keeps combinations that satisfy the join condition. A left outer join also keeps unmatched rows from the left side, filling missing right-side values with nulls. Always identify the intended cardinality: one to one, one to many, or many to many through an associative table. A missing predicate creates a Cartesian product, while an incomplete predicate can silently duplicate results. Qualify ambiguous column names and inspect row counts before and after the join. Ask what one result row represents. If that sentence is unclear, aggregation and reporting built on the join will also be unclear."],
      ["Aggregate at the intended grain", "Group enrollment rows by course, compute counts and averages, and filter groups separately from rows.", "Aggregate functions summarize groups of rows, and GROUP BY defines the result grain.", ["postgres-tutorial"], "Count, sum, average, minimum, and maximum summarize rows. Group by determines which rows share one output group. If a query groups by course, each result row represents one course. Columns in the select list must either define that grain or be aggregated. Where filters individual rows before grouping; having filters groups after aggregation. Null handling matters because many aggregates ignore null values. Distinct may remove duplicates, but using it to hide a faulty join masks the real problem. State the result grain in words, create a small example, and verify that every join and group preserves the intended meaning."],
      ["Normalize repeated facts", "Decompose one update-prone table into relations where each fact is stored in one appropriate place.", "Normalization reduces update anomalies by separating facts according to their functional dependencies.", ["postgres-tutorial"], "A poorly designed table may repeat the same course title, instructor office, or department name across hundreds of enrollment rows. Repetition creates anomalies: one update can leave conflicting versions, deleting the last enrollment can erase course information, and inserting a course may require a fake enrollment. Normalization analyzes which attributes depend on which keys and separates different kinds of facts into related tables. Decomposition should preserve the ability to reconstruct necessary information through joins and enforce dependencies where possible. Normalization is not a command to maximize table count. It is a reasoning tool for storing each durable fact in a controlled place while keeping the model usable."],
      ["Use indexes as a tradeoff", "Compare a full table scan with a tree index lookup while showing storage and update costs.", "Indexes can accelerate selected lookups and ordering operations but consume space and add maintenance work.", ["postgres-index"], "An index is an auxiliary structure that helps the database locate rows without scanning every row. A B-tree index often supports equality and range conditions on its leading keys. Unique indexes can also enforce uniqueness. Indexes are not free. Inserts, updates, and deletes must maintain them, they consume storage, and an index that does not match query predicates may not be used. The query planner estimates costs and chooses among scans and join strategies. Index columns based on important workload patterns, then inspect actual plans and measurements. Adding an index to every column can make writes slower without improving the queries that matter."],
      ["Group changes into transactions", "Run a transfer as debit and credit inside BEGIN, then compare COMMIT with ROLLBACK after failure.", "A transaction groups statements into a unit that commits together or is rolled back together.", ["postgres-advanced"], "Many business actions require several statements to succeed as one unit. A transfer may subtract from one account and add to another. If the process fails between those statements, the database must not preserve half a transfer. A transaction begins a unit of work and ends with commit to make changes durable or rollback to discard them. Concurrent transactions also need isolation rules so interleaving operations do not produce invalid results. Keep transactions as short as practical, handle failures explicitly, and do not assume that application code alone can restore consistency after every crash. Transaction boundaries should match the atomic action users and business rules recognize."],
      ["Use a complete data-management checklist", "Summarize meaning, keys, constraints, query grain, joins, normalization, indexes, transactions, and measurement.", "Reliable relational data management combines a meaningful schema, enforced integrity, correct queries, and workload-aware performance decisions.", ["postgres-tutorial", "postgres-advanced", "postgres-index"], "A professional database design answers nine questions. What does each table and row represent? Which keys identify rows and connect relations? Which constraints prevent invalid states? What is the grain of each query result? Do join predicates match the intended cardinality? Are repeated facts creating anomalies? Which workload justifies each index? Which changes must commit atomically? What do query plans and measurements show on realistic data? SQL syntax is only the surface. Trustworthy data systems come from preserving meaning and integrity while giving applications efficient, testable ways to derive results and apply changes. Finish by testing the schema with a tiny dataset that contains a valid relationship, a missing reference, a duplicate, a null, and a transaction that must roll back. Then inspect the actual query plan for the most important read. Those checks connect the conceptual model to enforceable behavior and measured performance."],
    ],
  },
  {
    slug: "ai-search-foundations",
    template: "showcase-search",
    title: "Artificial Intelligence Foundations: Agents and Search",
    subject: "Introduction to Artificial Intelligence",
    description:
      "Formulate intelligent agents and search problems, then compare BFS, DFS, uniform-cost, greedy, and A* search with heuristic guarantees.",
    outcomes: [
      "Formulate an environment as a state-space search problem",
      "Compare uninformed and informed search strategies",
      "Explain admissibility, consistency, completeness, and optimality"
    ],
    sources: [
      {
        id: "berkeley-agents",
        title: "UC Berkeley CS188: Agents",
        uri: "https://inst.eecs.berkeley.edu/~cs188/textbook/search/agents.html",
        author: "UC Berkeley CS188",
        content:
          "A rational agent perceives an environment through sensors and acts through actuators to pursue expected outcomes. Reflex agents choose from current state, while planning agents use a model to evaluate possible action sequences. Environments differ in observability, determinism, dynamics, and other properties.",
      },
      {
        id: "berkeley-state",
        title: "UC Berkeley CS188: State Spaces and Search Problems",
        uri: "https://inst.eecs.berkeley.edu/~cs188/textbook/search/state.html",
        author: "UC Berkeley CS188",
        content:
          "A search problem defines a state space, actions, transition model, action cost, start state, and goal test. Search trees represent paths through a state-space graph. Graph search tracks explored states to avoid redundant expansion.",
      },
      {
        id: "berkeley-informed",
        title: "UC Berkeley CS188: Informed Search",
        uri: "https://inst.eecs.berkeley.edu/~cs188/textbook/search/informed.html",
        author: "UC Berkeley CS188",
        content:
          "Greedy search prioritizes heuristic estimates of remaining distance, while A* combines path cost and heuristic estimate. Admissible heuristics do not overestimate optimal remaining cost. Consistency constrains heuristic change across an edge and supports optimal graph-search behavior.",
      },
    ],
    beats: [
      ["Define an agent and environment", "Place sensors, internal decision process, actuators, and environment in a perception-action loop.", "An intelligent agent perceives an environment and selects actions intended to advance defined goals or utility.", ["berkeley-agents"], "Artificial intelligence can be organized around agents. An agent receives percepts through sensors and affects an environment through actuators. A thermostat senses temperature and controls heating; a game agent observes a board and selects moves. Calling an action intelligent requires a performance objective and information assumptions. A rational agent selects the action expected to perform best given its percept history and knowledge, not one guaranteed to succeed in every uncertain world. The environment may be fully or partially observable, deterministic or stochastic, static or changing. These properties determine which representations and algorithms are appropriate. Begin by specifying the task environment rather than choosing an AI technique because it is fashionable."],
      ["Contrast reflex and planning behavior", "Compare a direct condition-action rule with a model-based agent simulating future action sequences.", "Planning agents use a model of consequences, while reflex agents select actions primarily from current conditions.", ["berkeley-agents"], "A reflex agent maps the current situation to an action, such as braking when an obstacle is close. Reflexes can be fast and effective when local rules cover the environment. A planning agent represents possible future states and evaluates action sequences before acting. Planning becomes valuable when an action’s benefit depends on later consequences or when several routes compete. It also has a cost: the state space can grow rapidly, the model may be wrong, and the world may change during computation. Many real systems combine layers—fast safety reflexes around a slower planner. The design question is not whether planning is always smarter, but which consequences must be represented to meet the performance objective."],
      ["Formulate a search problem", "Turn a maze into state space, actions, transition model, costs, start state, and goal test.", "A search problem specifies states, actions, transitions, action costs, a start state, and a goal test.", ["berkeley-state"], "Search requires a precise formulation. A state contains the information needed to choose future actions. Actions specify available choices. The transition model predicts the next state. Action cost measures the value spent. The start state identifies the initial condition, and a goal test recognizes success. In route finding, a state may be a location, actions may follow roads, and cost may represent distance or time. Include too little state and the model cannot predict consequences; include irrelevant detail and the search space becomes needlessly large. The formulation determines what solutions mean before any algorithm explores them. A correct algorithm on the wrong state representation solves the wrong problem efficiently."],
      ["Distinguish graph and search tree", "Unfold one state-space graph into multiple paths and show repeated states entering a search tree.", "A search tree represents paths through a state-space graph, so the same state can appear through multiple action sequences.", ["berkeley-state"], "The state space is a graph of possible configurations and transitions. A search algorithm builds a tree of paths from the start. The same state may appear multiple times because different paths reach it. Tree search can therefore revisit cycles forever or repeat expensive work. Graph search maintains an explored set or best-known cost information to control repeated expansion. But duplicate handling must match the algorithm. In cost-based search, reaching a known state through a cheaper path may require updating the frontier. A search node often stores a state, parent, action, path cost, and depth so the final action sequence can be reconstructed. State equality and hashing are part of the algorithm’s correctness."],
      ["Compare breadth-first and depth-first search", "Expand one frontier by shallowest depth and another by newest path, then compare memory and solution behavior.", "Breadth-first search expands shallowest nodes, while depth-first search follows a path deeply before backtracking.", ["berkeley-state"], "Breadth-first search uses a first-in, first-out frontier and explores by depth. With equal action costs, the first goal found has the fewest actions. Its frontier can require large memory. Depth-first search uses a stack and pursues one branch before backtracking. It can use less frontier memory but may spend a long time down an unhelpful branch and does not generally find the shortest solution. Graph search and finite-state assumptions affect completeness. Neither strategy understands action cost beyond depth. Choose according to the guarantee the problem needs, not a slogan that one is faster. A small example with unequal edge costs exposes why fewest actions and least total cost are different objectives."],
      ["Use uniform-cost search for path cost", "Prioritize frontier nodes by accumulated path cost and replace an expensive path when a cheaper one appears.", "Uniform-cost search expands the frontier path with lowest accumulated cost and is optimal under appropriate nonnegative cost conditions.", ["berkeley-state"], "Uniform-cost search orders the frontier by path cost g of n. It may explore a deeper path before a shallow one when the deeper path is cheaper. With nonnegative costs and appropriate graph-search handling, the first removed goal is optimal. The algorithm needs a priority queue and must track the best cost found for states. A cheaper path to an existing frontier state should replace or supersede the expensive one. Uniform-cost search uses no estimate of remaining distance, so it can expand many states in directions that are cheap so far but far from a goal. It provides a baseline for understanding how informed search adds guidance without giving up cost reasoning."],
      ["Use heuristics as informed estimates", "Attach an estimated remaining cost to each frontier state and compare a helpful heuristic with a misleading one.", "A heuristic estimates cost from a state to a goal and can guide search toward promising regions.", ["berkeley-informed"], "A heuristic h of n uses problem knowledge to estimate remaining cost. Straight-line distance can guide geographic routing because it is inexpensive and related to travel distance. Greedy best-first search chooses the state with smallest h, focusing on apparent closeness while ignoring the cost already paid. It can be fast but is not generally optimal or complete in all settings. A heuristic should be cheaper to compute than the search work it saves. Zero is always an uninformative baseline for nonnegative costs. Better heuristics distinguish promising states while respecting the guarantees required by the algorithm. Heuristic design is representation design: it encodes a simplified view of the problem."],
      ["Combine cost and estimate with A star", "Rank frontier nodes by g plus h and show how the balance changes between uniform-cost and greedy search.", "A* search prioritizes f(n)=g(n)+h(n), combining known path cost with estimated remaining cost.", ["berkeley-informed"], "A star balances the cost accumulated so far, g, with the heuristic estimate to the goal, h. If h is zero, A star behaves like uniform-cost search. If g is ignored, behavior resembles greedy search. The sum estimates total solution cost through a frontier node. An admissible heuristic never overestimates the true remaining optimal cost. Consistency requires that the heuristic at one state be no greater than one-step cost plus the heuristic at the successor. Under standard conditions, these properties support optimality and efficient graph-search handling. A star’s memory use can still be substantial, and a highly accurate heuristic may itself be expensive. Guarantees depend on the exact assumptions and implementation."],
      ["Evaluate search beyond one returned path", "Compare completeness, optimality, time, space, expanded nodes, and model error across strategies.", "Search strategies should be evaluated by solution guarantees, time, memory, and the validity of their problem formulation.", ["berkeley-state", "berkeley-informed"], "A returned path is only one dimension of quality. Completeness asks whether an algorithm will find a solution when one exists under stated conditions. Optimality asks whether the solution minimizes the defined cost. Time and space can be estimated by states expanded and stored, often in terms of branching factor and solution depth. Practical evaluation also measures frontier size, duplicate handling, and heuristic computation. Most importantly, a mathematically optimal path in an inaccurate model may be poor in the real environment. Costs, transitions, and goals must represent what users actually value. Search evaluation joins algorithmic guarantees with model validation rather than treating them as separate worlds."],
      ["Use a complete search-design checklist", "Summarize agent objective, state, actions, transitions, costs, strategy, duplicate handling, heuristic, and evaluation.", "A defensible search system connects an explicit task model to an algorithm whose guarantees and resource costs are understood.", ["berkeley-agents", "berkeley-state", "berkeley-informed"], "A complete search design answers nine questions. What performance objective defines rational behavior? What information does each state contain? Which actions and transitions are possible? What does path cost represent? What are the start and goal conditions? Which frontier rule matches the required guarantee? How are repeated states and cheaper paths handled? If a heuristic is used, what does it estimate and what properties can be justified? Finally, how do time, memory, solution quality, and model error behave on representative cases? Artificial intelligence is not produced by naming an algorithm. It comes from connecting a clear environment model to a decision process whose behavior can be explained and tested."],
    ],
  },
];

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function buildStoryboard(lesson) {
  let elapsed = 0;
  const sections = lesson.beats.map(
    ([title, visual, claim, sourceIds, narration]) => {
      const start = elapsed;
      elapsed += 62;
      return `## ${formatTime(start)} - ${formatTime(elapsed)} — ${title}

**[VISUAL]** template:${lesson.template} | ${visual}
**[CLAIM ${sourceIds.join(",")}]** ${claim}

**[VOICEOVER]**

${narration}

**Delivery:** Professional, clear, and appropriately paced for an introductory computer science lesson.`;
    },
  );
  return `# ${lesson.title}\n\n${sections.join("\n\n")}\n`;
}

function buildConfig(lesson) {
  return {
    schemaVersion: 1,
    preset: "rit-course",
    project: {
      id: `long-form-${lesson.slug}`,
      title: lesson.title,
      owner: "Kenju Tomita",
      courseCode: lesson.subject.toUpperCase(),
      department: "RIT AI Club",
      audience: "introductory computer science students",
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
        voice: "en-US-AndrewMultilingualNeural",
        rate: "-2%",
        pitch: "+0Hz",
      },
    },
    roles: { narration: { primary: "edge-narration", fallbacks: [] } },
    workflow: {
      groundingMode: "source-pack",
      determinism: "record",
      approvals: [],
      outputRoot: `.demo-output/long-form-lessons/${lesson.slug}`,
      cacheRoot: ".video-cache/v2",
      maxCostUsd: 0,
      allowUnknownCost: false,
    },
    brandPack: null,
  };
}

for (const lesson of lessons) {
  const directory = join(root, lesson.slug);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "storyboard.md"), buildStoryboard(lesson)),
    writeFile(
      join(directory, "sources.json"),
      `${JSON.stringify(
        {
          sources: lesson.sources.map((source) => ({
            ...source,
            type: "url",
            verified: true,
          })),
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      join(directory, "catalog.json"),
      `${JSON.stringify(
        {
          id: `full-${lesson.slug}`,
          title: lesson.title,
          area: "Computer Science",
          subject: lesson.subject,
          format: "Full lesson",
          level: "Introductory",
          description: lesson.description,
          outcomes: lesson.outcomes,
          paths: ["Computing & Engineering", "STEM Foundations"],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      join(directory, "video.config.json"),
      `${JSON.stringify(buildConfig(lesson), null, 2)}\n`,
    ),
  ]);
}

console.log(
  JSON.stringify({
    count: lessons.length,
    lessons: lessons.map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      beats: lesson.beats.length,
    })),
  }),
);
