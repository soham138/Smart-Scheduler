/**
 * Advanced Load Balancer
 * Optimizes and balances timetable distribution across days and weeks
 * 
 * Goals:
 * - Even distribution of theory/lab hours across 5 days
 * - No day overloaded or underloaded
 * - Minimize time gaps
 * - Strategic placement of breaks and free time
 */

class AdvancedLoadBalancer {
  constructor(schedule = {}) {
    this.schedule = schedule;
    this.daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    this.collegeStart = 9 * 60; // 09:00 in minutes
    this.collegeEnd = 17 * 60;  // 17:00 in minutes
    this.breakDuration = 15 + 45; // Tea + Recess = 60 minutes total
    this.maxDailyLoad = 480 - this.breakDuration; // ~420 minutes available per day
  }

  /**
   * Analyze current load distribution
   */
  analyzeLoadDistribution() {
    const dailyAnalysis = {};

    for (const day of this.daysOfWeek) {
      const daySlots = Object.values(this.schedule).filter(s => s.day === day);
      
      const theoryHours = daySlots
        .filter(s => s.type === 'THEORY')
        .reduce((sum, s) => sum + this.calculateDuration(s.start, s.end), 0);

      const labHours = daySlots
        .filter(s => s.type === 'LAB')
        .reduce((sum, s) => sum + this.calculateDuration(s.start, s.end), 0);

      const breakHours = daySlots
        .filter(s => ['BREAK', 'RECESS'].includes(s.type))
        .reduce((sum, s) => sum + this.calculateDuration(s.start, s.end), 0);

      const totalUsed = theoryHours + labHours + breakHours;
      const utilizationPercent = (totalUsed / this.maxDailyLoad) * 100;

      dailyAnalysis[day] = {
        theory: theoryHours,
        lab: labHours,
        breaks: breakHours,
        total: totalUsed,
        utilization: utilizationPercent,
        available: this.maxDailyLoad - totalUsed,
        slotCount: daySlots.length
      };
    }

    return this.calculateBalanceMetrics(dailyAnalysis);
  }

  /**
   * Calculate balance metrics
   */
  calculateBalanceMetrics(dailyAnalysis) {
    const loads = Object.values(dailyAnalysis).map(d => d.total);
    const avgLoad = loads.reduce((a, b) => a + b, 0) / 5;
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    const variance = this.calculateVariance(loads, avgLoad);

    return {
      daily: dailyAnalysis,
      statistics: {
        average: avgLoad,
        max: maxLoad,
        min: minLoad,
        range: maxLoad - minLoad,
        variance,
        standardDeviation: Math.sqrt(variance),
        isBalanced: maxLoad - minLoad < 120 // < 2 hours difference is good
      }
    };
  }

  /**
   * Detect underused days
   */
  getUnderutilizedDays() {
    const analysis = this.analyzeLoadDistribution();
    const avgLoad = analysis.statistics.average;
    const threshold = avgLoad * 0.7; // 30% below average

    const underutilized = [];
    for (const [day, data] of Object.entries(analysis.daily)) {
      if (data.total < threshold) {
        underutilized.push({
          day,
          currentLoad: data.total,
          threshold,
          gap: threshold - data.total,
          utilizationPercent: data.utilization
        });
      }
    }

    return underutilized;
  }

  /**
   * Detect overloaded days
   */
  getOverloadedDays() {
    const analysis = this.analyzeLoadDistribution();
    const avgLoad = analysis.statistics.average;
    const threshold = avgLoad * 1.3; // 30% above average

    const overloaded = [];
    for (const [day, data] of Object.entries(analysis.daily)) {
      if (data.total > threshold) {
        overloaded.push({
          day,
          currentLoad: data.total,
          threshold,
          excess: data.total - threshold,
          utilizationPercent: data.utilization
        });
      }
    }

    return overloaded;
  }

  /**
   * Suggest redistributions to balance load
   */
  suggestRebalancing() {
    const underutilized = this.getUnderutilizedDays();
    const overloaded = this.getOverloadedDays();

    const suggestions = [];

    for (const under of underutilized) {
      for (const over of overloaded) {
        const movableHours = (over.excess / 60); // Convert to hours
        
        if (movableHours > 0) {
          suggestions.push({
            action: 'MOVE_CLASSES',
            from: over.day,
            to: under.day,
            estimatedHours: Math.min(movableHours, 2), // Move up to 2 hours
            impact: {
              fromReduction: Math.min(movableHours, 2) * 60,
              toAddition: Math.min(movableHours, 2) * 60
            }
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Detect and fix time gaps
   */
  getTimeGaps() {
    const gaps = [];

    for (const day of this.daysOfWeek) {
      const daySlots = Object.values(this.schedule)
        .filter(s => s.day === day && !['BREAK', 'RECESS'].includes(s.type))
        .sort((a, b) => this.timeToMinutes(a.start) - this.timeToMinutes(b.start));

      for (let i = 0; i < daySlots.length - 1; i++) {
        const endTime = this.timeToMinutes(daySlots[i].end);
        const nextStart = this.timeToMinutes(daySlots[i + 1].start);
        const gapMinutes = nextStart - endTime;

        if (gapMinutes > 60) { // Gap > 1 hour
          gaps.push({
            day,
            between: `${daySlots[i].subject_code} (${daySlots[i].end}) and ${daySlots[i + 1].subject_code} (${daySlots[i + 1].start})`,
            gapMinutes,
            suggestions: this.suggestGapFilling(daySlots[i], daySlots[i + 1])
          });
        }
      }
    }

    return gaps;
  }

  /**
   * Suggest ways to fill a gap
   */
  suggestGapFilling(beforeSlot, afterSlot) {
    const suggestions = [];

    // Suggestion 1: Shift the second class earlier
    suggestions.push({
      type: 'SHIFT_LATER_CLASS_EARLIER',
      description: `Move ${afterSlot.subject_code} forward to start at ${beforeSlot.end}`
    });

    // Suggestion 2: Extend the first class
    suggestions.push({
      type: 'EXTEND_EARLIER_CLASS',
      description: `Extend ${beforeSlot.subject_code} to fill gap (if feasible)`
    });

    // Suggestion 3: Add another class in the gap
    suggestions.push({
      type: 'ADD_CLASS_IN_GAP',
      description: 'Schedule another subject or lab during the gap'
    });

    return suggestions;
  }

  /**
   * Suggest optimal scheduling for a subject
   */
  suggestOptimalDays(subject, subjectType = 'THEORY', frequency = 2) {
    const analysis = this.analyzeLoadDistribution();
    
    // Get least loaded days
    const daysByLoad = Object.entries(analysis.daily)
      .sort((a, b) => a[1].total - b[1].total)
      .slice(0, frequency)
      .map(entry => entry[0]);

    return {
      subject: subject.code,
      recommendedDays: daysByLoad,
      reasoning: 'Distribute across least loaded days for balance'
    };
  }

  /**
   * Suggest optimal time slots preferring consolidated blocks
   */
  suggestOptimalTimeSlots(slotType = 'THEORY') {
    const analysis = this.analyzeLoadDistribution();
    
    const preferredTimes = [];

    // Prefer mid-day slots (10:00-12:00, 14:00-16:00) for theory
    // to avoid early morning rush and late afternoon fatigue
    if (slotType === 'THEORY') {
      preferredTimes.push(
        { start: '10:00', end: '11:00', block: 'Mid-Morning' },
        { start: '14:00', end: '15:00', block: 'Early Afternoon' },
        { start: '09:00', end: '10:00', block: 'Early Morning' }
      );
    } else if (slotType === 'LAB') {
      // Prefer afternoon slots for labs (less fatigue)
      preferredTimes.push(
        { start: '14:00', end: '16:00', block: 'Afternoon' },
        { start: '11:15', end: '13:15', block: 'Late Morning' },
        { start: '09:00', end: '11:00', block: 'Early Morning' }
      );
    }

    return preferredTimes;
  }

  /**
   * Generate comprehensive rebalancing report
   */
  generateRebalancingReport() {
    const analysis = this.analyzeLoadDistribution();
    const underutilized = this.getUnderutilizedDays();
    const overloaded = this.getOverloadedDays();
    const gaps = this.getTimeGaps();
    const suggestions = this.suggestRebalancing();

    return {
      analysis,
      issues: {
        underutilizedDays: underutilized,
        overloadedDays: overloaded,
        timeGaps: gaps,
        totalGapMinutes: gaps.reduce((sum, g) => sum + g.gapMinutes, 0)
      },
      suggestions,
      generalRecommendations: [
        analysis.statistics.isBalanced 
          ? '✅ Load is well balanced across days' 
          : '⚠️ Load imbalance detected - rebalancing recommended',
        `Maximum daily load: ${analysis.statistics.max} minutes (${(analysis.statistics.max / 60).toFixed(1)} hours)`,
        `Minimum daily load: ${analysis.statistics.min} minutes (${(analysis.statistics.min / 60).toFixed(1)} hours)`,
        `Load variance: ${Math.sqrt(analysis.statistics.variance).toFixed(0)} minutes`,
        gaps.length > 0 ? `${gaps.length} gaps > 1 hour detected - consolidation recommended` : 'No significant gaps'
      ]
    };
  }

  /**
   * Helper: Calculate variance
   */
  calculateVariance(values, mean) {
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Helper: Convert time to minutes
   */
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  /**
   * Helper: Calculate duration
   */
  calculateDuration(start, end) {
    return this.timeToMinutes(end) - this.timeToMinutes(start);
  }

  /**
   * Generate visual load report
   */
  generateVisualReport() {
    const analysis = this.analyzeLoadDistribution();
    let report = '\n╔════════════════════════════════════════════════════════════════════╗\n';
    report += '║              LOAD DISTRIBUTION ANALYSIS                           ║\n';
    report += '╚════════════════════════════════════════════════════════════════════╝\n';

    for (const [day, data] of Object.entries(analysis.daily)) {
      const barLength = Math.round((data.utilization / 100) * 40);
      const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
      
      report += `\n${day.padEnd(3)} │ ${bar} │ ${data.utilization.toFixed(0)}% (${(data.total / 60).toFixed(1)}h)\n`;
      report += `     ├─ Theory: ${(data.theory / 60).toFixed(1)}h | Lab: ${(data.lab / 60).toFixed(1)}h | Free: ${(data.available / 60).toFixed(1)}h\n`;
    }

    report += `\n└─ Average: ${(analysis.statistics.average / 60).toFixed(1)}h | Range: ${(analysis.statistics.range / 60).toFixed(1)}h\n`;
    report += `   Balance Status: ${analysis.statistics.isBalanced ? '✅ GOOD' : '⚠️ NEEDS ADJUSTMENT'}\n`;

    return report;
  }
}

module.exports = AdvancedLoadBalancer;
