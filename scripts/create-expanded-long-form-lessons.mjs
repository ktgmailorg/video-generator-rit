import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve("courses/long-form-lessons");

const lessons = [
  {
    slug: "pid-control-systems",
    projectId: "long-form-pid-control-systems",
    area: "Engineering",
    subject: "Controls and Mechatronics",
    courseCode: "CONTROLS AND MECHATRONICS",
    audience: "introductory controls and engineering technology students",
    title: "PID Control Systems: From Feedback Error to Practical Tuning",
    description:
      "Build a complete PID control model from feedback error through term behavior, performance measurement, tuning, windup protection, filtering, and digital implementation.",
    outcomes: [
      "Explain proportional, integral, and derivative contributions",
      "Interpret rise time, overshoot, settling, and steady-state error",
      "Tune and implement a PID loop with practical safeguards"
    ],
    paths: ["Computing & Engineering", "STEM Foundations"],
    sources: [
      {
        id: "umich-pid",
        title: "Introduction: PID Controller Design",
        uri: "https://ctms.engin.umich.edu/CTMS/index.php?example=Introduction&section=ControlPID",
        author: "University of Michigan Control Tutorials for MATLAB and Simulink",
        content:
          "A PID controller combines proportional, integral, and derivative action. Proportional action scales present error, integral action accumulates error over time, and derivative action responds to the rate of change of error. The three gains influence rise time, overshoot, settling time, steady-state error, and stability in different ways. Many practical designs use only a subset of the three terms.",
      },
      {
        id: "umich-feedback",
        title: "Introduction: System Analysis",
        uri: "https://ctms.engin.umich.edu/CTMS/index.php?example=Introduction&section=SystemAnalysis",
        author: "University of Michigan Control Tutorials for MATLAB and Simulink",
        content:
          "Closed-loop control measures system output, compares it with a reference, and uses the resulting error to determine the input. Time-domain response is commonly evaluated using rise time, overshoot, settling time, and steady-state error. Stability and model uncertainty must be considered when selecting controller gains.",
      },
    ],
    beats: [
      {
        title: "Why feedback control exists",
        visual: "Show a motor speed drifting under changing load, then close a measurement loop around it.",
        claim: "Closed-loop control repeatedly compares measured output with a desired reference and uses their difference to correct the system.",
        sourceIds: ["umich-feedback"],
        narration:
          "A controller is useful when a system must reach and maintain a target despite disturbances and uncertainty. Imagine a motor commanded to run at one thousand revolutions per minute. An open-loop command may work under one load and miss the target under another. Feedback changes the structure of the problem. A sensor measures actual speed, the controller compares it with the desired speed, and the difference becomes an error signal. The controller uses that error to change the motor input. The new speed is measured again, so correction is continuous rather than a one-time guess. This lesson develops the proportional, integral, and derivative terms, then connects their behavior to tuning, noise, saturation, and a practical design workflow.",
      },
      {
        title: "Define the loop and its signals",
        visual: "Label reference, error, controller, actuator, plant, output, sensor, and disturbance in one closed loop.",
        equation: "e(t) = r(t) − y(t)",
        claim: "Tracking error is the reference minus the measured output, and the controller maps that error into a plant input.",
        sourceIds: ["umich-feedback"],
        narration:
          "Start by naming every signal. The reference r of t is the desired behavior. The measured output y of t is what the sensor reports. Their difference, e of t, equals reference minus measured output. The controller converts error into a command u of t. An actuator applies that command to the plant, which is the physical or simulated system being controlled. Disturbances can enter the plant, while sensor noise can enter the measurement path. This vocabulary prevents a common mistake: the controller does not directly control the error. It changes the plant input, observes the resulting output, and thereby influences future error. Sign conventions also matter. With negative feedback, a positive error should normally produce a correction that increases the output toward the reference.",
      },
      {
        title: "Understand proportional action",
        visual: "Increase proportional gain and compare slow correction, fast correction, and oscillatory overreaction.",
        equation: "uP(t) = Kp e(t)",
        claim: "Proportional action creates a control contribution that is directly scaled from present error.",
        sourceIds: ["umich-pid"],
        narration:
          "The proportional term responds to the error that exists right now. Its contribution is K p times e of t. If the error doubles, the proportional correction doubles. Increasing K p usually makes the response more forceful and can reduce rise time, but excessive gain can produce overshoot, oscillation, or instability. Proportional action alone may also leave a steady offset. To hold a load against friction, for example, the actuator may require a nonzero command. If command is proportional to error, a persistent error may be needed to produce that command. This is not a defect in the formula; it is a consequence of the loop and plant. The important skill is to connect gain to observed response rather than memorizing that larger is always better.",
      },
      {
        title: "Use integral action to remove persistent error",
        visual: "Accumulate a small error area over time until the controller supplies the missing steady command.",
        equation: "uI(t) = Ki ∫ e(t) dt",
        claim: "Integral action accumulates error history and can drive a persistent steady-state error toward zero.",
        sourceIds: ["umich-pid"],
        narration:
          "The integral term responds to the history of error. Its state grows while error has one sign and shrinks when the sign reverses. A small error that persists can therefore produce a large enough correction to eliminate the offset left by proportional control. This makes integral action powerful, but it also introduces memory. If the actuator saturates at its maximum while the error remains large, the integral state can continue accumulating even though the plant cannot respond further. When the system finally approaches the target, that stored integral action may drive it far past the reference. This is called integral windup. Practical controllers limit, pause, or back-calculate the integral state during saturation. Integral action solves one problem while creating a responsibility to manage its stored state.",
      },
      {
        title: "Use derivative action as damping",
        visual: "Compare the slope of error for a rapidly approaching response and a slowly changing response.",
        equation: "uD(t) = Kd de(t)/dt",
        claim: "Derivative action responds to the rate of change of error and can add anticipatory damping to the response.",
        sourceIds: ["umich-pid"],
        narration:
          "The derivative term reacts to how quickly the error is changing. If the output is racing toward the target, the error may still be positive but decreasing rapidly. A derivative contribution can oppose that motion before the target is crossed, adding damping and reducing overshoot. The difficulty is that differentiation amplifies rapid measurement changes, including sensor noise. Real implementations therefore use a filtered derivative rather than an ideal mathematical derivative. Many controllers also differentiate the measurement instead of the error, which avoids a large derivative kick when the reference changes suddenly. Derivative action is not mandatory. A well-tuned PI controller is often sufficient, especially when sensors are noisy or the plant already has adequate damping.",
      },
      {
        title: "Combine the PID terms",
        visual: "Stack present, accumulated, and trend contributions into one actuator command with visible limits.",
        equation: "u(t) = Kp e(t) + Ki ∫e(t)dt + Kd de(t)/dt",
        claim: "A PID command is the sum of proportional, integral, and derivative contributions, subject to the actuator and implementation limits.",
        sourceIds: ["umich-pid"],
        narration:
          "A PID controller adds the three contributions into one command. Proportional action handles present error, integral action handles accumulated error, and derivative action responds to trend. These descriptions are useful, but the terms interact through the same plant. Increasing K p changes the response that the integral and derivative terms observe. Increasing K i may remove offset while reducing stability margin. Increasing K d may add damping while increasing noise sensitivity. The final command is also bounded by actuator voltage, force, valve opening, or another physical limit. A controller equation without limits, sample time, sensor characteristics, and plant dynamics is incomplete. Good tuning treats the loop as one system rather than adjusting three independent knobs in isolation.",
      },
      {
        title: "Read time-domain performance",
        visual: "Annotate rise time, peak overshoot, settling band, steady-state error, and oscillation on a step response.",
        claim: "Rise time, overshoot, settling time, and steady-state error describe different aspects of closed-loop time response.",
        sourceIds: ["umich-feedback", "umich-pid"],
        narration:
          "A step response turns vague words like fast or stable into measurable criteria. Rise time describes how quickly output moves toward the new target. Peak overshoot measures how far it exceeds the target. Settling time measures how long it takes to remain inside an acceptable band. Steady-state error is the remaining difference after transients decay. These measures can conflict. A gain change that shortens rise time may increase overshoot. Integral action that removes final error may lengthen settling. Stability is the first requirement: a fast response that grows without bound is not useful. Before tuning, define which measures matter for the application and what constraints cannot be violated. A camera gimbal, temperature chamber, and chemical flow controller should not share one generic tuning objective.",
      },
      {
        title: "Tune with a disciplined sequence",
        visual: "Walk through requirements, safe baseline, proportional response, integral correction, derivative damping, and validation.",
        claim: "PID gains should be selected against explicit performance requirements and validated over expected operating conditions.",
        sourceIds: ["umich-feedback", "umich-pid"],
        narration:
          "A disciplined tuning process begins with safety and requirements. Confirm sensor polarity, actuator limits, and a safe test range. Start with integral and derivative action disabled. Increase proportional gain until the system responds clearly without unacceptable oscillation. Add integral action gradually to remove persistent error, while watching overshoot and windup. Add derivative action only when extra damping is needed and the measurement is clean enough to support it. Then test reference changes, disturbances, load variation, saturation, and noise. This sequence is not a universal proof of optimality, but it makes cause and effect observable. More formal model-based methods can calculate gains, yet every real implementation still requires validation against unmodeled behavior and physical limits.",
      },
      {
        title: "Recognize implementation details",
        visual: "Convert continuous PID terms into sampled updates with sample time, filtering, clamping, and bumpless transfer.",
        claim: "A digital PID controller must define sampling, derivative filtering, integral management, and transitions between operating modes.",
        sourceIds: ["umich-pid"],
        narration:
          "Most PID controllers run in software, so the continuous equation becomes a sampled algorithm. The sample period must be short enough to observe relevant plant dynamics but not so short that noise dominates. The integral becomes a running numerical sum. The derivative becomes a filtered difference between samples. Output clamping enforces actuator limits, and anti-windup keeps the integral state consistent with those limits. Systems that switch between manual and automatic control also need bumpless transfer so the stored controller state does not create a sudden command jump. Record the sample time and exact algorithm with the gains; K p, K i, and K d have meaning only within a defined implementation and unit convention.",
      },
      {
        title: "Use a complete PID reasoning checklist",
        visual: "Summarize loop signals, term purposes, performance metrics, limits, tuning, and validation in one engineering checklist.",
        claim: "Practical PID design combines feedback structure, term behavior, measured performance, physical constraints, and validation.",
        sourceIds: ["umich-feedback", "umich-pid"],
        narration:
          "A reliable PID analysis answers six questions. What are the reference, measured output, error, command, plant, and disturbances? What behavior does proportional, integral, and derivative action contribute in this loop? Which performance measures define success? Where can the actuator or sensor saturate? How are sample time, filtering, and anti-windup implemented? And has the design been tested across the real operating range? The goal is not to use all three letters. The goal is a stable, understandable controller that meets requirements with appropriate complexity. Sometimes that is P, often PI, and sometimes full PID. If you can explain the loop and predict the consequence of each change before turning a gain, you are tuning as an engineer rather than searching blindly.",
      },
    ],
  },
  {
    slug: "spectroscopy-measurement",
    projectId: "long-form-spectroscopy-measurement",
    area: "Science",
    subject: "Physics, Chemistry, and Imaging Science",
    courseCode: "PHYSICS AND CHEMISTRY",
    audience: "introductory physics, chemistry, and imaging science students",
    title: "Spectroscopy: Measuring Light to Identify Matter",
    description:
      "Follow the complete spectroscopy measurement chain from photon energy and characteristic transitions through instrumentation, calibration, reference matching, quantification, and uncertainty.",
    outcomes: [
      "Relate spectral features to light-matter interactions",
      "Explain spectrometer components and calibration",
      "Evaluate spectral identification and quantitative claims"
    ],
    paths: ["STEM Foundations", "Research & Evidence"],
    sources: [
      {
        id: "nist-spectroscopy",
        title: "Spectroscopy: A Measurement Powerhouse",
        uri: "https://www.nist.gov/spectroscopy/what-spectroscopy",
        author: "National Institute of Standards and Technology",
        content:
          "Spectroscopy uses interactions between light and matter to gather information. Atoms and molecules absorb and radiate characteristic frequencies, creating spectral fingerprints. Measured spectra can reveal identity, composition, concentration, and temperature. Spectrometers separate light into frequencies, and absorption and emission spectroscopy support applications from atmospheric measurement to astronomy and medicine.",
      },
      {
        id: "nist-data",
        title: "NIST Atomic Spectra Database",
        uri: "https://physics.nist.gov/PhysRefData/ASD/",
        author: "National Institute of Standards and Technology",
        content:
          "The NIST Atomic Spectra Database provides critically evaluated atomic energy levels, wavelengths, transition probabilities, and related reference data. Reference spectra and calibrated measurements allow experimental peaks to be compared with known transitions while preserving units, uncertainty, and measurement context.",
      },
    ],
    beats: [
      {
        title: "What a spectrum measures",
        visual: "Spread incoming light across a wavelength axis and turn brightness into a plotted signal.",
        claim: "Spectroscopy gathers information by measuring how light at different frequencies interacts with matter.",
        sourceIds: ["nist-spectroscopy"],
        narration:
          "A photograph records brightness and color across space. A spectrum records signal strength across wavelength or frequency. That change of axis makes spectroscopy one of science’s most powerful measurement tools. Matter does not absorb, emit, or scatter every frequency equally. The resulting pattern can reveal identity, composition, concentration, temperature, and physical conditions. This lesson builds the full measurement chain: light and wavelength, energy transitions, absorption and emission, optical components, calibration, reference matching, quantitative interpretation, uncertainty, and responsible conclusions. The central idea is simple: a colored line or peak is not an answer by itself. It becomes evidence only when the instrument, scale, reference, and sample conditions are understood.",
      },
      {
        title: "Connect wavelength, frequency, and energy",
        visual: "Link long wavelength to low frequency and short wavelength to high photon energy across the electromagnetic spectrum.",
        equation: "c = λν; E = hν",
        claim: "Wavelength and frequency are inversely related, and photon energy is proportional to frequency.",
        sourceIds: ["nist-spectroscopy"],
        narration:
          "Light can be described by wavelength lambda or frequency nu. In vacuum, their product equals the speed of light, so shorter wavelength means higher frequency. A photon’s energy equals Planck’s constant times frequency, making higher-frequency photons more energetic. Visible light occupies only a narrow part of the electromagnetic spectrum. Infrared measurements are sensitive to many molecular vibrations, ultraviolet and visible measurements can probe electronic behavior, and radio or microwave frequencies can probe other transitions. The chosen spectral region must match the physical interaction under study. Always state the horizontal-axis unit—nanometers, micrometers, inverse centimeters, hertz, or electron volts—because the same feature appears at different numerical positions on different scales.",
      },
      {
        title: "Understand characteristic transitions",
        visual: "Move particles between allowed energy levels and connect each energy difference to an absorbed or emitted frequency.",
        equation: "ΔE = hν",
        claim: "Characteristic atomic and molecular energy differences produce characteristic absorption or emission frequencies.",
        sourceIds: ["nist-spectroscopy", "nist-data"],
        narration:
          "Atoms and molecules have structured energy states rather than a continuous set of arbitrary energies. When a system absorbs a photon whose energy matches an allowed difference, it can move to a higher state. When it returns to a lower state, it may emit a photon. Because elements and molecules have different structures, their allowed transitions form characteristic patterns. This is the basis of the spectral fingerprint idea. Real spectra also contain line widths, overlapping bands, and intensity differences shaped by temperature, pressure, concentration, selection rules, and the instrument. Identification therefore relies on a pattern of evidence, not a single conveniently placed peak. Evaluated databases such as NIST’s provide reference wavelengths and transition data for comparison.",
      },
      {
        title: "Distinguish emission and absorption",
        visual: "Compare a bright-line emission spectrum with an absorption spectrum containing missing frequencies.",
        claim: "Emission spectroscopy measures frequencies radiated by a source, while absorption spectroscopy measures frequencies removed as light passes through a sample.",
        sourceIds: ["nist-spectroscopy"],
        narration:
          "In emission spectroscopy, the sample or source radiates light and the instrument measures its frequencies. A hot gas, plasma, flame, or excited material can produce emission features. In absorption spectroscopy, a known light source passes through or reflects from a sample. Frequencies that interact strongly with the material are reduced relative to a reference measurement. The instrument may display transmittance, absorbance, reflectance, or raw intensity, and those are not interchangeable without a defined transformation. Emission answers what the source radiates under its excitation conditions. Absorption answers how the sample modifies an incident spectrum. Both can identify matter, but their sample preparation, calibration, background signals, and quantitative models differ.",
      },
      {
        title: "Follow the spectrometer signal path",
        visual: "Trace source, sample, entrance slit, dispersive element, detector, digitizer, and spectrum.",
        claim: "A spectrometer separates or resolves frequencies and measures their signal with a detector.",
        sourceIds: ["nist-spectroscopy"],
        narration:
          "A basic instrument begins with a source or emitting sample. Light is collected and often restricted by a slit or optical fiber. A prism, diffraction grating, interferometer, or another frequency-selective system separates spectral information. A detector converts arriving light into an electrical signal, and software maps detector response onto a wavelength or frequency axis. Every component changes the result. A wider slit collects more light but can reduce spectral resolution. A detector may be sensitive in one range and nearly blind in another. Stray light can fill in absorption features. The displayed spectrum is therefore a measurement produced by a chain, not a transparent copy of the sample. Instrument settings belong in the scientific record.",
      },
      {
        title: "Calibrate wavelength and response",
        visual: "Align measured reference peaks to certified positions, then correct a sloping detector response.",
        claim: "Reference standards and calibration are required to relate detector output to trustworthy wavelength and intensity values.",
        sourceIds: ["nist-data", "nist-spectroscopy"],
        narration:
          "Calibration establishes what the instrument’s axes mean. A wavelength calibration compares measured features from a reference source with accepted positions and fits the mapping from detector coordinate to wavelength. An intensity or response calibration accounts for the fact that the source, optics, and detector do not respond equally at every frequency. Background and dark measurements estimate signals that exist without the intended sample contribution. Calibration is not permanent. Temperature changes, alignment, aging, and configuration can shift response. Record the standard, date, settings, correction method, and residual error. If a measured peak differs from a reference by less than the instrument uncertainty, reporting extra decimal places does not create extra knowledge.",
      },
      {
        title: "Identify an unknown with a pattern",
        visual: "Preprocess an unknown spectrum, align peaks, compare multiple candidates, and score the full pattern.",
        claim: "Reliable spectral identification compares multiple measured features with reference data under compatible conditions.",
        sourceIds: ["nist-data", "nist-spectroscopy"],
        narration:
          "To identify an unknown, begin with calibrated data and documented preprocessing. Remove or model background carefully; aggressive smoothing can erase real narrow features. Locate peaks or bands with uncertainty, then compare positions and relative structure against candidate references. One match is rarely sufficient. Look for multiple expected features and ask whether strong predicted features are missing. Check that the reference and sample share compatible phase, temperature, pressure, and measurement mode. Mixtures may combine signals from several substances, and overlapping peaks can make a unique answer impossible. A defensible result reports the candidate, supporting features, conflicting evidence, and confidence limits rather than presenting a database’s top match as certainty.",
      },
      {
        title: "Move from identity to amount",
        visual: "Build a calibration curve from standards and place an unknown signal within the validated range.",
        claim: "Quantitative spectroscopy requires calibrated relationships between signal and amount within a validated measurement range.",
        sourceIds: ["nist-spectroscopy"],
        narration:
          "Spectroscopy can also estimate concentration or amount. That requires more than recognizing a peak. Measure standards with known concentrations using the same preparation and instrument conditions as the unknown. Choose a signal metric, such as peak height, integrated area, or absorbance at a defined frequency. Fit a calibration model only across the range where assumptions are supported. Then process the unknown identically and propagate uncertainty from preparation, repeatability, calibration, and background correction. Extrapolating beyond the standards is risky because detector response, chemistry, or absorption behavior may become nonlinear. Quantitative work is strongest when blanks, replicates, controls, and independent check standards show that the model remains valid.",
      },
      {
        title: "Account for resolution, noise, and uncertainty",
        visual: "Separate two close peaks at high resolution, merge them at low resolution, and add noise bands around the signal.",
        claim: "Spectral conclusions are limited by resolution, signal-to-noise ratio, calibration, and sample-dependent uncertainty.",
        sourceIds: ["nist-data", "nist-spectroscopy"],
        narration:
          "Resolution describes the ability to distinguish nearby spectral features. Signal-to-noise ratio describes how clearly a feature rises above variation. More measurement time can improve some noise, but it cannot automatically fix inadequate resolution, stray light, saturation, or a biased calibration. Peak position has uncertainty, and so do intensity and concentration. Replicate measurements reveal repeatability; standards reveal accuracy and drift; blanks reveal background. When two candidate substances have features closer than the instrument can resolve, the correct conclusion may be that the measurement cannot distinguish them. Scientific strength comes from matching the claim to the instrument’s demonstrated capability, not from forcing every spectrum into a definite label.",
      },
      {
        title: "Use a complete spectroscopy checklist",
        visual: "Summarize question, spectral region, instrument chain, calibration, preprocessing, references, uncertainty, and conclusion.",
        claim: "Trustworthy spectroscopy connects a physical question to a documented measurement chain and an uncertainty-aware interpretation.",
        sourceIds: ["nist-spectroscopy", "nist-data"],
        narration:
          "A complete spectral analysis answers eight questions. What property is being measured? Which spectral region and interaction carry that information? How did light move through the source, sample, optics, and detector? How were wavelength and response calibrated? What background correction and preprocessing were applied? Which reference data were used, and under what conditions? What are the resolution and uncertainty limits? Does the conclusion remain inside those limits? Spectroscopy is powerful because characteristic interactions turn light into evidence about matter. Its professionalism comes from preserving the chain between the physical transition and the reported claim. If another scientist can inspect that chain, repeat the measurement, and understand its limitations, the spectrum has become a defensible result.",
      },
    ],
  },
  {
    slug: "phishing-defense",
    projectId: "long-form-phishing-defense",
    area: "Computing",
    subject: "Cybersecurity and Digital Literacy",
    courseCode: "CYBERSECURITY AND DIGITAL LITERACY",
    audience: "students and staff learning practical cybersecurity",
    title: "Phishing Defense: Recognize, Verify, Report, and Recover",
    description:
      "Practice a complete phishing defense workflow covering manipulation signals, sender and destination inspection, independent verification, authentication protection, reporting, and incident response.",
    outcomes: [
      "Recognize consequential phishing warning signs",
      "Verify identities and requests through independent channels",
      "Report and respond to suspected compromise"
    ],
    paths: ["Computing & Engineering", "Digital Literacy"],
    sources: [
      {
        id: "cisa-tips",
        title: "Secure Our World: Avoid Phishing Scams",
        uri: "https://www.cisa.gov/sites/default/files/2024-09/Secure-Our-World-Phishing-Tip-Sheet.pdf",
        author: "Cybersecurity and Infrastructure Security Agency",
        content:
          "Phishing messages attempt to manipulate recipients into opening harmful links or attachments, sharing information, or taking unsafe actions. CISA recommends recognizing common warning signs, resisting urgency, independently verifying requests, using reporting mechanisms, and deleting confirmed phishing messages.",
      },
      {
        id: "cisa-cycle",
        title: "Phishing Guidance: Stopping the Attack Cycle at Phase One",
        uri: "https://www.cisa.gov/sites/default/files/2023-10/Phishing%20Guidance%20-%20Stopping%20the%20Attack%20Cycle%20at%20Phase%20One_508c.pdf",
        author: "Cybersecurity and Infrastructure Security Agency",
        content:
          "Organizations should combine user reporting, technical controls, multifactor authentication, secure email practices, incident response, and rapid containment. Suspicious requests should be verified using independently obtained contact information. Reporting supports broader detection and response; a recipient should not simply forward a suspicious message without following organizational procedure.",
      },
    ],
    beats: [
      {
        title: "Understand the attacker’s objective",
        visual: "Show one deceptive message branching toward credential theft, malware, payment fraud, and data disclosure.",
        claim: "Phishing uses deceptive communication to induce unsafe actions such as sharing credentials, opening harmful content, or transferring value.",
        sourceIds: ["cisa-tips", "cisa-cycle"],
        narration:
          "Phishing is not defined by bad spelling or email alone. It is a social-engineering attack that uses a message to trigger an action useful to an attacker. That action might reveal a password, approve a sign-in, open malware, change payment details, or disclose sensitive information. Messages can arrive through email, text, social platforms, collaboration tools, phone calls, or QR codes. The attacker’s advantage is context: deadlines, authority, fear, curiosity, and routine business processes. This lesson builds a repeatable defense workflow: recognize suspicious signals, inspect destinations safely, verify through an independent channel, report quickly, protect accounts, and respond correctly if an action already occurred. The goal is not perfect intuition. It is a dependable process under pressure.",
      },
      {
        title: "Recognize manipulation signals",
        visual: "Annotate urgency, secrecy, authority, unexpected reward, unusual payment, and credential requests.",
        claim: "Urgency, unexpected requests, authority pressure, and requests for sensitive actions are common phishing warning signs.",
        sourceIds: ["cisa-tips"],
        narration:
          "Warning signs become useful when treated as reasons to pause, not as proof by themselves. The message creates unusual urgency, asks for secrecy, invokes a senior leader, promises an unexpected benefit, threatens an immediate consequence, or changes a normal payment process. It may request a password, multifactor code, gift card, bank change, document access, or software installation. A familiar logo or accurate personal detail does not make the message safe; attackers can copy branding and use public information. Likewise, a legitimate message can contain a typo. Evaluate the requested action, context, and verification path together. The higher the consequence, the stronger the verification should be.",
      },
      {
        title: "Inspect identity and destination",
        visual: "Compare display name with full address, link text with actual domain, and a normal domain with a look-alike.",
        claim: "Display names and visible link text can differ from the actual sender address and destination.",
        sourceIds: ["cisa-tips"],
        narration:
          "A display name is only a label. Expand the sender information and inspect the complete address, including the domain after the at sign. Look for look-alike spelling, unexpected consumer email services, or a reply-to address that differs from the sender. For links, the visible text may not be the destination. On a desktop, preview the destination without opening it; on a phone, use the platform’s safe link-preview behavior if available. Read the registered domain from right to left before the first slash. Attackers can place a trusted name in a subdomain or path while the actual domain belongs to them. Do not paste a suspicious link into a browser merely to see what happens.",
      },
      {
        title: "Verify through an independent channel",
        visual: "Reject contact details inside the message and instead use a known directory, saved number, or official site.",
        claim: "Suspicious requests should be verified using independently obtained contact information rather than contact details supplied by the message.",
        sourceIds: ["cisa-tips", "cisa-cycle"],
        narration:
          "Independent verification breaks the attacker’s control of the conversation. If a message asks for a payment change, call the requester using a number already in your records. If it claims to be an account alert, open the official application or type the organization’s known address instead of following the embedded link. If a colleague requests sensitive data, contact them through a separate established channel. Do not rely on a phone number, reply address, or support link included in the suspicious message, because those can route back to the attacker. Verification should confirm both identity and requested action. Asking, ‘Did you send this?’ is weaker than confirming the specific file, amount, destination, and business purpose.",
      },
      {
        title: "Handle links, attachments, and QR codes safely",
        visual: "Route unexpected files and destinations to reporting or an approved scanning workflow instead of opening them.",
        claim: "Unexpected links, attachments, and QR codes should not be opened until the request and destination are independently verified.",
        sourceIds: ["cisa-tips", "cisa-cycle"],
        narration:
          "Links can lead to credential-harvesting sites or exploit attempts. Attachments can contain malicious code, active content, or deceptive forms. QR codes hide their destination from normal visual inspection and can move the interaction onto a less protected phone. The safe response is not to experiment. Report the item through your organization’s approved mechanism and let security tools or staff analyze it. If the document is genuinely needed, ask the sender to provide it through the normal approved repository after verification. File extensions and icons can be misleading, and cloud-hosted files are not automatically safe. Treat an unexpected delivery method as part of the risk signal.",
      },
      {
        title: "Protect credentials and multifactor prompts",
        visual: "Keep passwords and approval codes inside the known sign-in flow, then reject an unsolicited approval request.",
        claim: "Users should not disclose passwords or authentication codes in response to messages, and unsolicited multifactor prompts should be denied and reported.",
        sourceIds: ["cisa-cycle"],
        narration:
          "Credentials should be entered only into a known, verified sign-in flow. A message asking you to reply with a password or multifactor code is unsafe. A realistic fake sign-in page may capture the password and immediately ask for the code, allowing an attacker to use both. Unexpected push notifications are also a warning. Deny the request rather than approving it to make the notifications stop, then change the password from a trusted device and report the event. Password managers add a useful signal because they normally fill credentials only on the exact saved domain. Phishing-resistant authentication methods further reduce risk, but no single control replaces verification and reporting.",
      },
      {
        title: "Report before deleting",
        visual: "Send the original suspicious item through an official report function, preserve technical details, then remove it.",
        claim: "Prompt reporting helps an organization detect related messages and protect other recipients.",
        sourceIds: ["cisa-tips", "cisa-cycle"],
        narration:
          "Deleting a suspicious message protects only one inbox and may discard useful evidence. Use the organization’s phishing-report button, service desk, or documented security channel before deletion. The original message contains headers, routing information, URLs, and attachment identifiers that a screenshot or manual forward may omit. Reporting allows defenders to search for related messages, block infrastructure, warn other recipients, and determine whether anyone interacted. Do not broadly forward the suspicious content to colleagues as a warning; that can spread active links and attachments. Follow the approved process, add concise context about what looked suspicious and whether you clicked, then delete or quarantine the item as instructed.",
      },
      {
        title: "Respond after a click or disclosure",
        visual: "Move immediately from stop, disconnect if directed, report, change credentials, revoke sessions, and monitor.",
        claim: "After a suspected phishing interaction, rapid reporting and containment are more useful than hiding the mistake.",
        sourceIds: ["cisa-cycle"],
        narration:
          "If you clicked, entered credentials, approved a prompt, opened an attachment, or sent information, stop and report immediately. Speed matters because defenders may be able to revoke sessions, reset credentials, isolate a device, block transactions, or remove malicious messages before the impact grows. Use a trusted device and official channel. Describe exactly what happened, including the time and information disclosed. Change affected passwords through the legitimate site and do not reuse the replacement elsewhere. Follow organizational instructions before powering off or altering a potentially compromised device, because evidence may matter. A fast honest report is a security control. Delayed disclosure gives the attacker more time.",
      },
      {
        title: "Build organizational layers of defense",
        visual: "Layer user reporting, secure email, domain controls, authentication, least privilege, monitoring, and incident response.",
        claim: "Effective phishing defense combines trained users with technical controls and an established incident-response process.",
        sourceIds: ["cisa-cycle"],
        narration:
          "Organizations should not place the full burden on individual recipients. Secure email gateways, domain-authentication controls, attachment analysis, URL protection, phishing-resistant multifactor authentication, least privilege, logging, and rapid incident response reduce both likelihood and impact. Training should use the organization’s real reporting workflow and should measure constructive behavior, especially timely reporting, rather than humiliating people who make mistakes. Finance and account-change processes need independent confirmation steps that cannot be bypassed by one urgent message. Security teams need a way to remove malicious mail at scale and communicate clearly during an incident. Human judgment works best as one layer in a system designed to expect deception.",
      },
      {
        title: "Use the pause-verify-report checklist",
        visual: "Summarize pause, inspect, verify independently, report, remove, and respond as one repeatable decision path.",
        claim: "A repeatable pause, inspect, independently verify, report, and respond workflow reduces phishing risk.",
        sourceIds: ["cisa-tips", "cisa-cycle"],
        narration:
          "Use one checklist whenever a message requests a consequential action. Pause before interacting. Inspect the full sender identity and destination. Ask whether the request, timing, tone, and delivery method fit the normal process. Verify identity and action through a separately obtained channel. Report the original message using the approved mechanism, then remove it as directed. If you already interacted, report immediately and follow containment steps. None of these checks depends on catching one spelling error or having perfect technical knowledge. They create time and independent evidence—the two things a social-engineering attack tries to remove. A secure response is not ‘I knew it looked fake.’ It is ‘I followed a process that would still work when the message looked real.’",
      },
    ],
  },
  {
    slug: "oxygen-transport",
    projectId: "long-form-oxygen-transport",
    area: "Health Sciences",
    subject: "Anatomy and Physiology",
    courseCode: "ANATOMY AND PHYSIOLOGY",
    audience: "introductory health science and biology students",
    title: "Oxygen Transport: From Alveolar Gas to Working Tissue",
    description:
      "Connect ventilation, diffusion, hemoglobin binding, the dissociation curve, perfusion, oxygen content, and tissue delivery as one physiological transport system.",
    outcomes: [
      "Trace oxygen from alveoli to working tissue",
      "Interpret the oxygen-hemoglobin dissociation curve",
      "Distinguish oxygen pressure, saturation, content, and delivery"
    ],
    paths: ["STEM Foundations"],
    sources: [
      {
        id: "openstax-gas-exchange",
        title: "OpenStax Anatomy and Physiology 2e: Gas Exchange",
        uri: "https://openstax.org/books/anatomy-and-physiology-2e/pages/22-4-gas-exchange",
        author: "OpenStax",
        content:
          "External respiration exchanges oxygen and carbon dioxide between alveoli and pulmonary blood, while internal respiration exchanges gases between systemic blood and tissues. Diffusion follows partial-pressure gradients across thin respiratory and tissue barriers. Ventilation and perfusion must be coordinated to support gas exchange.",
      },
      {
        id: "openstax-transport",
        title: "OpenStax Anatomy and Physiology 2e: Transport of Gases",
        uri: "https://openstax.org/books/anatomy-and-physiology-2e/pages/22-5-transport-of-gases",
        author: "OpenStax",
        content:
          "A small fraction of blood oxygen is dissolved in plasma, while most is carried by hemoglobin in erythrocytes. Each hemoglobin has four heme groups capable of binding oxygen. Cooperative binding produces a sigmoidal oxygen-hemoglobin dissociation curve. Partial pressure, pH, carbon dioxide, temperature, and 2,3-BPG influence loading and unloading.",
      },
    ],
    beats: [
      {
        title: "Follow oxygen as a transport system",
        visual: "Trace oxygen from ventilation to alveoli, pulmonary blood, systemic circulation, tissue diffusion, and mitochondria.",
        claim: "Oxygen delivery requires ventilation, alveolar diffusion, blood transport, circulation, and tissue unloading.",
        sourceIds: ["openstax-gas-exchange", "openstax-transport"],
        narration:
          "Oxygen does not move from the atmosphere to a cell in one step. Ventilation brings fresh gas to the alveoli. Diffusion moves oxygen across the respiratory membrane. Hemoglobin carries most of it through blood. The heart and vessels deliver that blood to tissues, and another diffusion gradient moves oxygen into cells. A problem at any stage can reduce delivery. This lesson connects partial pressure, membrane exchange, hemoglobin structure, the dissociation curve, loading and unloading, ventilation-perfusion matching, oxygen content, and clinical interpretation. The key distinction is between oxygen pressure, hemoglobin saturation, oxygen content, and tissue delivery. They are related, but they are not the same measurement.",
      },
      {
        title: "Use partial pressure to predict diffusion",
        visual: "Compare oxygen partial pressure in alveolar gas, incoming pulmonary blood, arterial blood, and active tissue.",
        claim: "Oxygen diffuses from regions of higher partial pressure toward regions of lower partial pressure.",
        sourceIds: ["openstax-gas-exchange"],
        narration:
          "In a gas mixture, each gas contributes a partial pressure. Oxygen moves down its partial-pressure gradient, not because the body actively pumps each molecule across a membrane. In healthy lungs, alveolar oxygen partial pressure exceeds that of incoming pulmonary capillary blood, so oxygen diffuses into blood. In systemic tissues, cells consume oxygen, keeping local oxygen partial pressure lower than arterial blood, so oxygen diffuses out of capillaries. The gradient describes direction, while the membrane area, thickness, diffusion properties, and time available influence how much transfer occurs. If the gradient narrows or the barrier thickens, equilibration can become less complete.",
      },
      {
        title: "Cross the respiratory membrane",
        visual: "Zoom from alveolar air across epithelium, fused basement membranes, capillary endothelium, plasma, and red cell.",
        claim: "Alveolar gas and pulmonary capillary blood exchange oxygen across a thin respiratory membrane.",
        sourceIds: ["openstax-gas-exchange"],
        narration:
          "The respiratory membrane places air and blood extremely close while keeping them in separate compartments. Oxygen moves from alveolar gas through a thin fluid layer, alveolar epithelium, basement membrane region, capillary endothelium, plasma, and finally into red blood cells. Large surface area and small diffusion distance support rapid exchange. Fluid accumulation, inflammation, loss of surface area, or reduced contact time can impair transfer. Ventilation must also refresh alveolar gas, and perfusion must bring blood to the exchanging surface. A normal membrane cannot oxygenate blood that never reaches it, and well-perfused capillaries cannot help alveoli that receive no fresh air.",
      },
      {
        title: "Carry oxygen with hemoglobin",
        visual: "Show a red blood cell packed with hemoglobin and four heme sites reversibly binding oxygen.",
        equation: "Hb + O₂ ⇌ HbO₂",
        claim: "Most oxygen in blood is reversibly bound to hemoglobin, while a smaller fraction is dissolved in plasma.",
        sourceIds: ["openstax-transport"],
        narration:
          "Oxygen is not very soluble in plasma, so dissolved oxygen alone would carry only a small amount. Red blood cells contain hemoglobin, a protein with four subunits and four iron-containing heme groups. Each heme can reversibly bind one oxygen molecule. Binding does not permanently consume oxygen; loading in the lungs and unloading in tissues depend on local conditions. The dissolved portion is small but important because oxygen partial pressure reflects dissolved molecules and helps drive diffusion. Hemoglobin-bound oxygen contributes most of the blood’s oxygen content. This distinction explains why a partial-pressure measurement and an oxygen-content measurement answer different physiological questions.",
      },
      {
        title: "Read the dissociation curve",
        visual: "Plot hemoglobin saturation against oxygen partial pressure and label plateau and steep unloading region.",
        claim: "Cooperative oxygen binding gives the oxygen-hemoglobin dissociation curve a sigmoidal shape.",
        sourceIds: ["openstax-transport"],
        narration:
          "The oxygen-hemoglobin dissociation curve plots saturation against oxygen partial pressure. Its S shape reflects cooperative binding: binding one oxygen changes hemoglobin in a way that facilitates additional binding, and unloading one can facilitate further unloading. At higher partial pressures, the curve forms a plateau, helping preserve high saturation despite moderate changes in lung oxygen pressure. In the steeper middle region, a smaller pressure decrease releases a larger fraction of bound oxygen, supporting tissue delivery. Saturation means the percentage of available heme sites occupied, not the total amount of hemoglobin present. A person can have high saturation but reduced oxygen content if hemoglobin concentration is low.",
      },
      {
        title: "Shift loading and unloading with local conditions",
        visual: "Shift the curve right with higher carbon dioxide, acidity, temperature, and 2,3-BPG, then show increased tissue unloading.",
        claim: "pH, carbon dioxide, temperature, and 2,3-BPG alter hemoglobin’s oxygen affinity and influence unloading.",
        sourceIds: ["openstax-transport"],
        narration:
          "Active tissues produce carbon dioxide, acids, and heat. These local changes reduce hemoglobin’s affinity for oxygen and shift the dissociation relationship toward greater unloading at a given partial pressure. A lower pH promotes oxygen release through the Bohr effect. Increased temperature and 2,3-BPG also favor unloading under relevant conditions. In the lungs, conditions favor loading as carbon dioxide leaves and oxygen partial pressure rises. A curve shift is not automatically good or bad. Reduced affinity can improve tissue unloading but can make lung loading less complete if alveolar oxygen is limited. Interpretation must always specify location and physiological goal.",
      },
      {
        title: "Match ventilation with perfusion",
        visual: "Compare a well-matched alveolus with one ventilated but underperfused and one perfused but underventilated.",
        claim: "Efficient gas exchange requires coordination between alveolar ventilation and pulmonary perfusion.",
        sourceIds: ["openstax-gas-exchange"],
        narration:
          "Ventilation delivers gas; perfusion delivers blood. Their relationship determines whether an alveolar region can contribute effectively to exchange. An alveolus with air but little blood wastes ventilation. An alveolus with blood but little fresh air cannot fully oxygenate that blood. The lungs use local responses to improve matching, but disease can create substantial mismatch. Thinking in terms of ventilation and perfusion prevents an oversimplified conclusion that breathing more always fixes low oxygen. The limitation may be airflow, blood flow, diffusion, inspired oxygen, hemoglobin, cardiac output, or tissue use. The transport chain must be examined stage by stage.",
      },
      {
        title: "Separate pressure, saturation, content, and delivery",
        visual: "Place PaO2, saturation, hemoglobin concentration, oxygen content, and cardiac output into a causal chain.",
        equation: "oxygen delivery ≈ cardiac output × arterial oxygen content",
        claim: "Tissue oxygen delivery depends on blood oxygen content and blood flow, not saturation alone.",
        sourceIds: ["openstax-transport", "openstax-gas-exchange"],
        narration:
          "Four quantities are often confused. Oxygen partial pressure reflects dissolved oxygen and drives diffusion. Saturation reports the fraction of hemoglobin binding sites occupied. Oxygen content depends strongly on how much hemoglobin is present and how saturated it is, plus a small dissolved component. Delivery adds blood flow: arterial oxygen content must be transported by cardiac output. In anemia, partial pressure and saturation can be normal while oxygen content is reduced because there is less hemoglobin. In low cardiac output, content may be adequate but delivery is reduced because less blood reaches tissue each minute. A pulse oximeter estimates saturation; it does not directly measure all four quantities.",
      },
      {
        title: "Apply the model to exercising tissue",
        visual: "Increase muscle oxygen use, lower local partial pressure, warm the tissue, and release more oxygen from passing blood.",
        claim: "Metabolically active tissues create conditions that increase the gradient for oxygen diffusion and promote hemoglobin unloading.",
        sourceIds: ["openstax-transport"],
        narration:
          "During exercise, muscle cells consume more oxygen and produce more carbon dioxide, acid, and heat. Local oxygen partial pressure falls, increasing the diffusion gradient from capillary blood into tissue. Conditions also favor hemoglobin unloading. Blood flow to active muscle rises, increasing delivery. These mechanisms coordinate transport with demand without requiring each red blood cell to know which tissue is active. Venous blood normally retains an oxygen reserve rather than unloading every molecule. During greater demand, extraction can increase. The example shows why the dissociation curve, circulation, and tissue metabolism belong in one model: delivery and unloading adjust together.",
      },
      {
        title: "Use a complete oxygen-transport checklist",
        visual: "Summarize ventilation, diffusion, hemoglobin, circulation, tissue gradient, and measurement distinctions.",
        claim: "Oxygen transport is best evaluated as a linked chain from alveolar ventilation through tissue delivery and use.",
        sourceIds: ["openstax-gas-exchange", "openstax-transport"],
        narration:
          "When reasoning about oxygen, ask six linked questions. Is fresh gas reaching the alveoli? Is there a sufficient partial-pressure gradient and functional respiratory membrane? Is pulmonary blood flowing through ventilated regions? Is enough hemoglobin present, and what fraction is saturated? Is cardiac output delivering sufficient oxygen content? Are tissues able to receive and use that oxygen? Then match each measurement to the question it can answer. Partial pressure, saturation, content, and delivery are not interchangeable. The full chain explains both normal exercise and clinical problems more accurately than a single number. Oxygen reaches working tissue because physical gradients, protein binding, and circulation operate as one transport system.",
      },
    ],
  },
];

function storyboard(lesson) {
  let elapsed = 0;
  const sections = lesson.beats.map((beat, index) => {
    const start = elapsed;
    elapsed += 62;
    const claimIds = beat.sourceIds.join(",");
    return [
      `## ${formatTime(start)} - ${formatTime(elapsed)} — ${beat.title}`,
      "",
      `**[VISUAL]** template:${templateFor(lesson.slug)} | ${beat.visual}`,
      beat.equation ? `**[EQUATION]** ${beat.equation}` : null,
      `**[CLAIM ${claimIds}]** ${beat.claim}`,
      "",
      "**[VOICEOVER]**",
      "",
      beat.narration,
      "",
      "**Delivery:** Professional, clear, and appropriately paced for an introductory college lesson.",
    ]
      .filter((line) => line !== null)
      .join("\n");
  });
  return `# ${lesson.title}\n\n${sections.join("\n\n")}\n`;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function templateFor(slug) {
  return {
    "pid-control-systems": "showcase-pid",
    "spectroscopy-measurement": "showcase-spectroscopy",
    "phishing-defense": "showcase-phishing",
    "oxygen-transport": "showcase-oxygen",
  }[slug];
}

function config(lesson) {
  return {
    schemaVersion: 1,
    preset: "rit-course",
    project: {
      id: lesson.projectId,
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
        voice: "en-US-AndrewMultilingualNeural",
        rate: "-2%",
        pitch: "+0Hz",
      },
    },
    roles: {
      narration: { primary: "edge-narration", fallbacks: [] },
    },
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
    writeFile(join(directory, "storyboard.md"), storyboard(lesson)),
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
      join(directory, "video.config.json"),
      `${JSON.stringify(config(lesson), null, 2)}\n`,
    ),
    writeFile(
      join(directory, "catalog.json"),
      `${JSON.stringify(
        {
          id: `full-${lesson.slug}`,
          title: lesson.title,
          area: lesson.area,
          subject: lesson.subject,
          format: "Full lesson",
          level: "Introductory",
          description: lesson.description,
          outcomes: lesson.outcomes,
          paths: lesson.paths,
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

console.log(
  JSON.stringify({
    count: lessons.length,
    lessons: lessons.map(({ slug, title, beats }) => ({
      slug,
      title,
      beats: beats.length,
    })),
  }),
);
