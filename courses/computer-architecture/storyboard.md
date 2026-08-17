# How a RISC-V ADD Instruction Moves Through a CPU

## 0:00 - 0:23 — Start with the contract

**[VISUAL]** template:riscv-architecture | Separate the RISC-V instruction-set contract from one classic five-stage implementation.
**[CLAIM riscv-isa,cs61c-five-stage]** The ISA defines the visible meaning and encoding of ADD, while a five-stage pipeline is one possible implementation.

**[VOICEOVER]**

Computer architecture becomes easier when we separate what software is promised from how hardware keeps that promise. The RISC-V instruction set defines what an ADD instruction means and how its fields are encoded. A classic five-stage pipeline is one microarchitecture that can implement that contract. We will trace one RV32I instruction: add x5, x6, x7.

**Delivery:** Precise and welcoming; emphasize the contract-versus-implementation distinction.

## 0:23 - 0:47 — Read the 32 instruction bits

**[VISUAL]** template:riscv-encoding | Break 0x007302B3 into funct7, rs2, rs1, funct3, rd, and opcode fields.
**[EQUATION]** 0000000 | 00111 | 00110 | 000 | 00101 | 0110011
**[CLAIM riscv-isa]** In RV32I, this R-type encoding identifies ADD with rs2=x7, rs1=x6, and rd=x5.

**[VOICEOVER]**

In this RV32I example, the instruction word is hexadecimal zero zero seven three zero two B three. The opcode, funct three, and funct seven fields select register-register ADD. The source fields name x6 and x7. The destination field names x5. Decode is not guessing from assembly text; the hardware receives these exact bits.

**Delivery:** Deliberate, with a short pause between field groups.

## 0:47 - 1:12 — Fetch and decode

**[VISUAL]** template:riscv-fetch-decode | Move the program counter through instruction memory into decode and the register file.
**[EQUATION]** PC: 0x1000 → 0x1004
**[CLAIM cs61c-five-stage]** The teaching pipeline fetches the instruction, advances the sequential program counter, decodes the operation, and reads source registers.

**[VOICEOVER]**

Assume the program counter is zero x one thousand and this teaching example uses 32-bit RV32I instructions without the compressed extension. Fetch uses that address to read the instruction word, while the sequential next address becomes zero x one thousand four. Decode separates the fields, generates control signals, and asks the register file for x6 and x7.

**Delivery:** Clear and sequential; treat the diagram as a left-to-right data path.

## 1:12 - 1:37 — Execute the addition

**[VISUAL]** template:riscv-execute | Feed x6=19 and x7=23 into the ALU and produce 42 for x5.
**[EQUATION]** x5 ← x6 + x7 = 19 + 23 = 42
**[CLAIM riscv-isa,cs61c-five-stage]** ADD uses the ALU to sum rs1 and rs2 and retains the low XLEN bits for rd.

**[VOICEOVER]**

Suppose x6 contains nineteen and x7 contains twenty-three. In Execute, operand-select logic sends both register values to the arithmetic logic unit. The ADD control selects integer addition, producing forty-two. For RV32I, ADD keeps the low thirty-two bits of the result. Arithmetic overflow does not raise an exception.

**Delivery:** Confident and concrete; let the arithmetic land before discussing overflow.

## 1:37 - 2:01 — Carry the result to writeback

**[VISUAL]** template:riscv-writeback | Show the ALU result crossing EX/MEM and MEM/WB registers, bypassing data-memory access, then writing x5.
**[CLAIM cs61c-five-stage]** A register-register ADD does not load or store data, but its result is retained through pipeline registers until Write Back updates the register file.

**[VOICEOVER]**

ADD does not need a data-memory read or write. In this five-stage teaching processor, the value still advances through the pipeline registers that separate Execute, Memory, and Write Back. Those registers keep the result, destination number, and write-enable control aligned. At Write Back, the processor commits forty-two into x5.

**Delivery:** Emphasize alignment of data and control, not merely movement.

## 2:01 - 2:28 — Overlap independent instructions

**[VISUAL]** template:riscv-timing | Use a cycle-by-cycle occupancy chart for three independent arithmetic instructions.
**[CLAIM cs61c-five-stage,cs61c-performance]** Pipeline stages allow independent instructions to overlap, improving throughput without necessarily reducing one instruction's latency.

**[VOICEOVER]**

The payoff appears when more instructions follow. While ADD is in Execute, a second independent instruction can be in Decode and a third can be in Fetch. After the pipeline fills, this idealized sequence can complete one instruction per cycle. That improves throughput. It does not mean one instruction suddenly crosses all five stages in one cycle.

**Delivery:** Contrast throughput with latency explicitly.

## 2:28 - 2:58 — Know where the simple picture breaks

**[VISUAL]** template:riscv-hazards | Contrast a read-after-write dependency with forwarding or a bubble, and a branch with a possible flush.
**[CLAIM cs61c-hazards]** Data and control hazards require mechanisms such as forwarding, stalling, prediction, or flushing to preserve correct execution.

**[VOICEOVER]**

This clean timing chart assumes independent instructions and available hardware. If the next instruction needs x5 before normal writeback, the processor has a data hazard. It may forward the ready result or insert a bubble. Branches create control hazards because already-fetched work may be wrong. Real pipelines add detection and recovery logic, but the governing rule stays simple: preserve the ISA result first, then optimize throughput.

**Delivery:** Finish with a rigorous caveat and a memorable priority: correctness before speed.
