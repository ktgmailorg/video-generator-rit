# RIT Institutional Application Roadmap

This document describes how One-Click AI Video Generator can move from an
official RIT AI Club project and supervised pilot into an RIT-supported
application available to students, faculty, and staff.

It is an implementation and intake guide, not evidence that RIT has approved
the application. “Official RIT AI Club project” and “official RIT-supported
application” are separate statuses.

## Recommended path

Use two tracks in sequence:

1. **Supervised AI Club pilot:** Continue the current small faculty pilots with
   public or instructor-approved, non-sensitive source material. Use the public
   site only for the project overview and examples. Run generation on a
   verified local companion or a project-team workstation.
2. **Institutional service intake:** Ask a faculty or staff sponsor and their
   college, division, or department to become the business owner. Submit the
   solution through RIT's project, security, accessibility, hosting, and SSO
   review processes before calling it a campus-wide RIT application.

The first institutional deployment should remain a limited-access tenant. Open
access for every student and employee should follow successful pilot evidence,
not precede it.

## Step 1: Secure an accountable RIT sponsor

Identify these named roles:

- **Executive sponsor:** A dean, vice president, department head, or designee
  who accepts final accountability and can authorize the institutional request.
- **Primary business process owner:** The faculty/staff unit responsible for
  the educational-video service, its policies, and its data.
- **Service owner:** The person responsible for access decisions, support,
  incident response, releases, and annual review.
- **Technical owner:** The team responsible for hosting, monitoring, backups,
  dependency updates, and security remediation.
- **Marketing steward:** The college/division representative who approves
  official messaging and brand use.

A student project lead can remain product and engineering lead, but should not
be the only long-term owner of a service intended for the entire university.
The current RIT Information Access and Protection Questionnaire asks for a
primary business process owner and primary ITS contact.

## Step 2: Choose the correct intake route

### AI Club website route

RIT states that official student clubs should use CampusGroups for their
website needs. If CampusGroups cannot support the interactive application, the
club can submit the **Website Exemption Form**. The request is reviewed by
Student Affairs, ITS, and University Web Services/Marketing and Communications.

Use this route for the club's project page and pilot recruitment. Explain why
the application requires more than a CampusGroups information page: local
companion discovery, authenticated pilot access, job status, accessible media
review, and downloadable production packages.

### Campus application route

For an application intended to become an RIT-supported service:

1. Have the sponsoring faculty/staff unit submit an ITS web/project request
   through the RIT Service Center or the linked PMO intake.
2. Identify the proposed business owner, technical owner, user population,
   hosting model, expected pilot dates, budget, and support model.
3. Ask ITS to identify the assigned project manager, Information Security
   contact, approved hosting route, and any architecture review required.
4. Submit the IAPQ before processing non-public RIT information.

Do not submit a procurement request merely to buy something when there is
nothing to purchase. If hosted providers, paid APIs, cloud storage, domains, or
software subscriptions will be purchased, RIT says software and digital
subscriptions require RIT Service Center review, including Information
Security and Legal Affairs.

## Step 3: Submit the data and security packet

Prepare the following before the intake meeting:

- System context and data-flow diagrams
- Complete component inventory and software bill of materials
- Hosting regions and execution locations
- Provider/model list and fallback behavior
- Data classifications for every input, intermediate, log, and output
- Authentication and authorization design
- Encryption in transit and at rest
- Secret storage and key-rotation process
- Retention, deletion, backup, and disaster-recovery rules
- Audit logging, monitoring, incident response, and vulnerability management
- Dependency and model update process
- Threat model for prompt injection, malicious documents, unsafe generated
  media, local-bridge abuse, cross-user access, and supply-chain compromise
- FERPA, research confidentiality, copyright, licensing, and records impacts
- Human approval gates and AI contribution disclosure

RIT classifies non-directory FERPA records, faculty research before
publication, health information, UIDs, and some third-party information as
Confidential. The first pilot should continue to reject grades, identifiable
student submissions, unpublished research, health information, and other
restricted material unless ITS approves the specific route.

### Proposed IAPQ description

Use this draft as a starting point and let the sponsoring business owner revise
and sign it:

> One-Click AI Video Generator is a provider-agnostic educational media
> production application developed as an official RIT AI Club project. It
> converts instructor-approved source material or an authored storyboard into
> a reviewable video package containing narration, educational visuals,
> captions, transcripts, source reports, accessibility checks, AI disclosure,
> and a reproducibility record. The pilot uses human approval gates for script
> and evidence, visuals, accessibility, and release. The proposed initial
> institutional tenant will accept Public and approved Internal course
> material only. Restricted, FERPA-protected, health, credential, payment, and
> unpublished research data will be blocked until separately reviewed and
> approved. AI execution may use an approved local model stack; any hosted
> provider route will be explicitly allowlisted by data classification.

## Step 4: Pass digital accessibility review

RIT states that it aims for WCAG 2.2 Level AA. Before institutional launch,
verify and retain evidence for:

- Full keyboard operation and visible focus
- Correct headings, landmarks, labels, names, roles, and status announcements
- Screen-reader testing on supported browser/platform combinations
- Sufficient text and non-text contrast
- Reflow, zoom, reduced-motion, and mobile behavior
- Error identification and recovery that does not rely on color alone
- Captions and corrected transcripts for every example and generated video
- Audio description or narration coverage for meaningful visual information
- Accessible downloadable reports and HTML transcripts
- No time limit that blocks users with disabilities
- An accessibility statement, feedback contact, and remediation process

Run automated tests, but include manual keyboard and screen-reader testing.
Record defects, owners, severity, and remediation dates in the release packet.

## Step 5: Request RIT SSO correctly

Do not use “the browser is already signed into an `@rit.edu` Google account” as
authorization. RIT's documented institutional integration is SAML/Shibboleth,
requested through the RIT Service Center.

The SSO request should include:

- Application purpose and owner contacts
- Pilot and eventual production URLs
- Service-provider metadata
- Requested attributes and the reason each is needed
- Whether each attribute is stored and for how long
- Authorization rules for students, faculty/staff, pilot operators, and
  administrators
- Logout, session expiration, account removal, and emergency access behavior
- Confirmation that the hosting environment meets the applicable server and
  web-security standards

Request the minimum attributes. Authentication proves identity; the
application must still perform authorization. Repository access should remain
a separate, reviewed contributor permission and should not be automatically
granted to every authenticated user.

## Step 6: Agree on hosting and the local-compute boundary

The current Vercel site is suitable as a pilot overview, not proof of approved
RIT institutional hosting. RIT's Web Standards say official web presence is
hosted on an ITS-supported environment unless an exception is approved.

Propose this institutional architecture:

- An ITS-approved web application hosts the UI, policy, catalog, and access
  control.
- Sensitive generation runs on an approved RIT-managed worker or a signed
  local companion registered to the user's session.
- The local companion binds to loopback, requires a short-lived pairing token,
  validates origins, and never exposes a general command-execution endpoint.
- Public demo assets use content-addressed storage with retained provenance.
- Final course publishing remains an instructor-controlled action. Direct
  Panopto integration is a later, separately reviewed capability.

Ask ITS whether the local companion may run on personally owned devices, only
on RIT-managed devices, or both. Do not silently install model weights or
request administrator privileges.

## Step 7: Brand, content, and academic governance

Before using an official RIT logo or calling an output an official RIT course
video:

- Obtain an approved external brand pack and named approval authority.
- Complete Marketing and Communications review.
- Maintain source coverage, asset licensing, AI disclosure, and instructor
  approvals.
- Publish an acceptable-use policy for AI-generated content.
- Define how instructors report factual, copyright, accessibility, or safety
  problems.
- Keep student-assignment rules configurable by the instructor.

The software should continue to label unapproved output as a course draft or
independent companion.

## Step 8: Run a controlled institutional pilot

Recommended acceptance cohort:

- One faculty lesson
- One student-assignment workflow using synthetic/non-sensitive submissions
- One central-media or teaching-support review
- One accessibility-focused review
- One security/operations exercise

For every pilot, retain:

- Sponsor and instructor approvals
- Data classification and source authorization
- Caption, transcript, and accessibility QA
- Claim/source, licensing, and AI disclosure reports
- Run lock and final media checksums
- User feedback, support incidents, cost, latency, and failure data

Expand access only after the sponsor, ITS, Information Security, accessibility
reviewer, and service owner accept the pilot report and unresolved risks.

## Ready-to-submit project request

**Request title:** Institutional pilot intake — One-Click AI Video Generator

**Requested service:** Review and guidance for an RIT-supported educational
video-generation application, including project intake, approved hosting,
information-security/data review, digital accessibility, and Shibboleth SSO.

**Business need:** Faculty and staff spend substantial time turning reviewed
course or research material into accessible instructional media. The
application creates a source-grounded, reviewable production package while
retaining instructor control and reproducible records.

**Current status:** The application is an official RIT AI Club project and is
pilot-ready. It has a private provider-agnostic Node.js repository, local-model
support, deterministic educational visuals, captions/transcripts, human
approval gates, data-policy routing, and recorded replay. The public site is a
demo/catalog, not the production application.

**Initial scope:** A limited pilot producing instructor-reviewed videos from
approved Public or Internal source material. No grades, identifiable student
submissions, health information, credentials, payment data, or unpublished
research. No automatic Panopto publishing and no official logo use without
separate approval.

**Requested decisions:**

1. Confirm the sponsoring business unit and assigned ITS contact.
2. Confirm the required IAPQ/security and privacy reviews.
3. Select an approved hosting and local-compute architecture.
4. Identify the digital-accessibility review owner and evidence required.
5. Approve a limited Shibboleth SSO integration and attribute set.
6. Define the conditions for a broader campus release.

## Evidence packet checklist

- [ ] Faculty/staff executive sponsor confirmed
- [ ] Business process owner and service owner confirmed
- [ ] AI Club leadership confirmation retained
- [ ] Pilot scope and success criteria approved
- [ ] Architecture and data-flow diagrams
- [ ] Data inventory and classification matrix
- [ ] IAPQ completed by sponsoring business unit
- [ ] Threat model and security controls
- [ ] Privacy/FERPA and records assessment
- [ ] Accessibility conformance report against WCAG 2.2 AA
- [ ] Hosting and support model
- [ ] SSO metadata, attributes, and authorization matrix
- [ ] Software bill of materials and license report
- [ ] Provider/model inventory and data-processing terms
- [ ] Budget, capacity, and cost controls
- [ ] Incident response, backup, retention, and deletion procedures
- [ ] Brand and communications review
- [ ] Pilot report with checksums and approvals
- [ ] Production launch and annual-review owners

## Official RIT references

- [Student clubs and student groups websites](https://www.rit.edu/webresources/student-clubs-and-student-groups-websites)
- [RIT Web Standards](https://www.rit.edu/brandportal/web-standards)
- [ITS web development and hosting](https://www.rit.edu/its/web-development-hosting)
- [RIT Information Access and Protection Questionnaire](https://www.rit.edu/security/sites/rit.edu.security/files/RIT%20Information%20Access%20and%20Protection%20Questionnaire%20%28IAPQ%29.pdf)
- [RIT information handling resources](https://www.rit.edu/security/information-handling-resources)
- [RIT Web Security Standard](https://www.rit.edu/security/web-security)
- [RIT Single Sign-On integration](https://shib03b.rit.edu/ITSOperations/Single-Sign-On---SSO_22252855.html)
- [Web Accessibility at RIT](https://www.rit.edu/web-accessibility-at-rit)
- [RIT Education Records Policy](https://www.rit.edu/policies/d150)
- [RIT software and digital subscription review](https://www.rit.edu/procurement/updates-tips)
