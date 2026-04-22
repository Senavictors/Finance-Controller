export type ObservationWindow = {
  actualRange: {
    from: Date
    to: Date
  } | null
  referenceDate: Date
}

export function resolveObservationWindow(
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): ObservationWindow {
  if (now < periodStart) {
    return {
      actualRange: null,
      referenceDate: new Date(periodStart.getTime() - 1),
    }
  }

  if (now > periodEnd) {
    return {
      actualRange: {
        from: periodStart,
        to: periodEnd,
      },
      referenceDate: periodEnd,
    }
  }

  return {
    actualRange: {
      from: periodStart,
      to: now,
    },
    referenceDate: now,
  }
}
