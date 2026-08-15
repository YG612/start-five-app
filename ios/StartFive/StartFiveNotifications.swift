import Foundation
import React
import UserNotifications

private enum NotificationKeys {
  static let event = "startFiveNotificationTap"
  static let identifierPrefix = "reminder:"
  static let taskId = "start_five_task_id"
  static let ruleId = "start_five_rule_id"
  static let reminderKind = "start_five_reminder_kind"
  static let triggerAt = "start_five_trigger_at"
  static let tapKind = "start_five_tap_kind"
  static let dayKey = "start_five_day_key"
  static let tomorrowFirst = "tomorrow_first"
}

private struct StoredIntent: Codable, Equatable {
  let taskId: String
  let ruleId: String
  let kind: String
  let triggerAt: String

  var stableId: String {
    "\(NotificationKeys.identifierPrefix)\(ruleId)"
  }
}

private struct StoredSnapshot: Codable, Equatable {
  let taskId: String
  let generation: Int
  let permission: String
  let intents: [StoredIntent]
  let scheduled: Bool
  let needsRecovery: Bool

  func withRecovery(_ value: Bool) -> StoredSnapshot {
    StoredSnapshot(
      taskId: taskId,
      generation: generation,
      permission: permission,
      intents: intents,
      scheduled: scheduled,
      needsRecovery: value
    )
  }
}

private struct ReplacementJournal: Codable {
  enum Phase: String, Codable {
    case applying
    case committed
  }

  let taskId: String
  let durablePrevious: StoredSnapshot?
  let next: StoredSnapshot
  let phase: Phase

  func withPhase(_ value: Phase) -> ReplacementJournal {
    ReplacementJournal(
      taskId: taskId,
      durablePrevious: durablePrevious,
      next: next,
      phase: value
    )
  }
}

private enum NotificationBridgeError: Error {
  case invalid(String)
  case corrupt(String)
  case recovery(String)
}

private final class NotificationPersistence {
  private let defaults = UserDefaults.standard
  private let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return encoder
  }()
  private let decoder = JSONDecoder()

  private func snapshotKey(_ taskId: String) -> String {
    "start_five_notifications_v1.snapshot.\(taskId)"
  }

  private func journalKey(_ taskId: String) -> String {
    "start_five_notifications_v1.journal.\(taskId)"
  }

  func snapshot(_ taskId: String) throws -> StoredSnapshot? {
    guard let data = defaults.data(forKey: snapshotKey(taskId)) else {
      return nil
    }
    do {
      return try decoder.decode(StoredSnapshot.self, from: data)
    } catch {
      throw NotificationBridgeError.corrupt("snapshot")
    }
  }

  func saveSnapshot(_ snapshot: StoredSnapshot) throws {
    defaults.set(try encoder.encode(snapshot), forKey: snapshotKey(snapshot.taskId))
  }

  func removeSnapshot(_ taskId: String) {
    defaults.removeObject(forKey: snapshotKey(taskId))
  }

  func journal(_ taskId: String) throws -> ReplacementJournal? {
    guard let data = defaults.data(forKey: journalKey(taskId)) else {
      return nil
    }
    do {
      return try decoder.decode(ReplacementJournal.self, from: data)
    } catch {
      throw NotificationBridgeError.corrupt("journal")
    }
  }

  func saveJournal(_ journal: ReplacementJournal) throws {
    defaults.set(try encoder.encode(journal), forKey: journalKey(journal.taskId))
  }

  func removeJournal(_ taskId: String) {
    defaults.removeObject(forKey: journalKey(taskId))
  }
}

private actor NotificationOperationSerializer {
  private var tail: Task<Void, Never> = Task {}

  func run<T>(_ operation: @escaping () async throws -> T) async throws -> T {
    let previous = tail
    let current = Task<T, Error> {
      await previous.value
      return try await operation()
    }
    tail = Task {
      _ = try? await current.value
    }
    return try await current.value
  }
}

struct NotificationTap {
  let kind: String
  let dayKey: String
  let taskId: String

  var dictionary: [String: String] {
    ["kind": kind, "dayKey": dayKey, "taskId": taskId]
  }
}

protocol NotificationTapSink: AnyObject {
  var hasTapListeners: Bool { get }
  func emitTap(_ tap: NotificationTap)
}

private final class NotificationTapBroker {
  static let shared = NotificationTapBroker()

  private let lock = NSLock()
  private weak var sink: NotificationTapSink?
  private var initialTap: NotificationTap?
  private var pendingHotTap: NotificationTap?

  func register(_ sink: NotificationTapSink) {
    lock.lock()
    self.sink = sink
    lock.unlock()
  }

  func unregister(_ sink: NotificationTapSink) {
    lock.lock()
    if self.sink === sink {
      self.sink = nil
    }
    lock.unlock()
  }

  func receive(_ tap: NotificationTap) {
    lock.lock()
    let current = sink
    if current == nil {
      initialTap = tap
      lock.unlock()
      return
    }
    if current?.hasTapListeners != true {
      pendingHotTap = tap
      lock.unlock()
      return
    }
    lock.unlock()
    current?.emitTap(tap)
  }

  func takeInitial() -> NotificationTap? {
    lock.lock()
    defer { lock.unlock() }
    let value = initialTap
    initialTap = nil
    return value
  }

  func listenerBecameAvailable(_ sink: NotificationTapSink) {
    lock.lock()
    guard self.sink === sink else {
      lock.unlock()
      return
    }
    let value = pendingHotTap ?? initialTap
    pendingHotTap = nil
    initialTap = nil
    lock.unlock()
    if let value {
      sink.emitTap(value)
    }
  }
}

@objc(StartFiveNotificationCenterDelegate)
final class StartFiveNotificationCenterDelegate: NSObject, UNUserNotificationCenterDelegate {
  @objc static let shared = StartFiveNotificationCenterDelegate()

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    defer { completionHandler() }
    let payload = response.notification.request.content.userInfo
    guard
      let kind = payload[NotificationKeys.tapKind] as? String,
      kind == NotificationKeys.tomorrowFirst,
      let dayKey = payload[NotificationKeys.dayKey] as? String,
      !dayKey.isEmpty,
      let taskId = payload[NotificationKeys.taskId] as? String,
      !taskId.isEmpty
    else {
      return
    }
    NotificationTapBroker.shared.receive(
      NotificationTap(kind: kind, dayKey: dayKey, taskId: taskId)
    )
  }
}

@objc(StartFiveNotifications)
final class StartFiveNotifications: RCTEventEmitter, NotificationTapSink {
  private let center = UNUserNotificationCenter.current()
  private let persistence = NotificationPersistence()
  private let serializer = NotificationOperationSerializer()
  private var observing = false

  override init() {
    super.init()
    NotificationTapBroker.shared.register(self)
  }

  deinit {
    NotificationTapBroker.shared.unregister(self)
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    false
  }

  override func supportedEvents() -> [String]! {
    [NotificationKeys.event]
  }

  override func startObserving() {
    observing = true
    NotificationTapBroker.shared.listenerBecameAvailable(self)
  }

  override func stopObserving() {
    observing = false
  }

  var hasTapListeners: Bool {
    observing
  }

  func emitTap(_ tap: NotificationTap) {
    sendEvent(withName: NotificationKeys.event, body: tap.dictionary)
  }

  @objc(getPermission:rejecter:)
  func getPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      let settings = await center.notificationSettings()
      resolve(permission(settings.authorizationStatus))
    }
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
        let settings = await center.notificationSettings()
        resolve(permission(settings.authorizationStatus))
      } catch {
        reject("NOTIFICATION_PERMISSION_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(get:resolver:rejecter:)
  func get(
    _ taskId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let snapshot = try await serializer.run { [self] in
          guard !taskId.isEmpty else {
            throw NotificationBridgeError.invalid("taskId")
          }
          try await recoverIfNeeded(taskId)
          let durable = try persistence.snapshot(taskId)
          if durable?.needsRecovery == true {
            throw NotificationBridgeError.recovery("snapshot")
          }
          let actual = try await actualIntents(taskId)
          guard !actual.isEmpty else {
            return nil as StoredSnapshot?
          }
          let settings = await center.notificationSettings()
          return StoredSnapshot(
            taskId: taskId,
            generation: durable?.generation ?? 0,
            permission: durable?.permission ?? permission(settings.authorizationStatus),
            intents: actual,
            scheduled: true,
            needsRecovery: false
          )
        }
        resolve(snapshot.map(snapshotDictionary))
      } catch {
        reject("NOTIFICATION_STATE_CORRUPT", error.localizedDescription, error)
      }
    }
  }

  @objc(replace:next:resolver:rejecter:)
  func replace(
    _ previous: [String: Any]?,
    next: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let suppliedPrevious = try previous.map(parseSnapshot)
        let nextSnapshot = try parseSnapshot(next)
        if let suppliedPrevious, suppliedPrevious.taskId != nextSnapshot.taskId {
          throw NotificationBridgeError.invalid("previous taskId mismatch")
        }
        try await serializer.run { [self] in
          try await recoverIfNeeded(nextSnapshot.taskId)
          try await replaceAtomically(suppliedPrevious, nextSnapshot.withRecovery(false))
        }
        resolve(nil)
      } catch {
        reject("NOTIFICATION_REPLACE_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(getInitialTap:rejecter:)
  func getInitialTap(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(NotificationTapBroker.shared.takeInitial()?.dictionary)
  }

  private func permission(_ status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral:
      return "granted"
    case .denied:
      return "denied"
    case .notDetermined:
      return "not_determined"
    @unknown default:
      return "denied"
    }
  }

  private func parseSnapshot(_ value: [String: Any]) throws -> StoredSnapshot {
    guard
      let taskId = value["taskId"] as? String,
      !taskId.isEmpty,
      let generation = value["generation"] as? NSNumber,
      generation.intValue >= 0,
      let permission = value["permission"] as? String,
      ["granted", "denied", "not_determined"].contains(permission),
      let scheduled = value["scheduled"] as? Bool,
      let rawIntents = value["intents"] as? [[String: Any]]
    else {
      throw NotificationBridgeError.invalid("snapshot")
    }
    var stableIds = Set<String>()
    let intents = try rawIntents.map { item -> StoredIntent in
      guard
        let intentTaskId = item["taskId"] as? String,
        intentTaskId == taskId,
        let ruleId = item["ruleId"] as? String,
        !ruleId.isEmpty,
        let kind = item["kind"] as? String,
        !kind.isEmpty,
        let triggerAt = item["triggerAt"] as? String,
        parseDate(triggerAt) != nil
      else {
        throw NotificationBridgeError.invalid("intent")
      }
      let intent = StoredIntent(
        taskId: intentTaskId,
        ruleId: ruleId,
        kind: kind,
        triggerAt: triggerAt
      )
      guard stableIds.insert(intent.stableId).inserted else {
        throw NotificationBridgeError.invalid("duplicate intent")
      }
      return intent
    }
    return StoredSnapshot(
      taskId: taskId,
      generation: generation.intValue,
      permission: permission,
      intents: sorted(intents),
      scheduled: scheduled,
      needsRecovery: false
    )
  }

  private func snapshotDictionary(_ snapshot: StoredSnapshot) -> [String: Any] {
    [
      "taskId": snapshot.taskId,
      "generation": snapshot.generation,
      "permission": snapshot.permission,
      "scheduled": snapshot.scheduled,
      "intents": snapshot.intents.map { intent in
        [
          "taskId": intent.taskId,
          "ruleId": intent.ruleId,
          "kind": intent.kind,
          "triggerAt": intent.triggerAt,
        ]
      },
    ]
  }

  private func parseDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) {
      return date
    }
    let standard = ISO8601DateFormatter()
    standard.formatOptions = [.withInternetDateTime]
    return standard.date(from: value)
  }

  private func sorted(_ intents: [StoredIntent]) -> [StoredIntent] {
    intents.sorted {
      if $0.triggerAt == $1.triggerAt {
        return $0.ruleId < $1.ruleId
      }
      return $0.triggerAt < $1.triggerAt
    }
  }

  private func request(_ intent: StoredIntent) throws -> UNNotificationRequest {
    guard let date = parseDate(intent.triggerAt) else {
      throw NotificationBridgeError.invalid("triggerAt")
    }
    var components = Calendar(identifier: .gregorian).dateComponents(
      in: TimeZone(secondsFromGMT: 0)!,
      from: date
    )
    components.timeZone = TimeZone(secondsFromGMT: 0)

    let content = UNMutableNotificationContent()
    content.title = "明日第一项"
    content.body = "打开 Start Five，先开始 5 分钟"
    content.sound = .default
    var payload: [String: String] = [
      NotificationKeys.taskId: intent.taskId,
      NotificationKeys.ruleId: intent.ruleId,
      NotificationKeys.reminderKind: intent.kind,
      NotificationKeys.triggerAt: intent.triggerAt,
    ]
    let tomorrowPrefix = "tomorrow-first:"
    if intent.ruleId.hasPrefix(tomorrowPrefix) {
      let dayKey = String(intent.ruleId.dropFirst(tomorrowPrefix.count))
      if !dayKey.isEmpty {
        payload[NotificationKeys.tapKind] = NotificationKeys.tomorrowFirst
        payload[NotificationKeys.dayKey] = dayKey
      }
    }
    content.userInfo = payload
    return UNNotificationRequest(
      identifier: intent.stableId,
      content: content,
      trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
    )
  }

  private func actualIntents(_ taskId: String) async throws -> [StoredIntent] {
    let requests = await center.pendingNotificationRequests()
    let matches = requests.filter { request in
      guard request.identifier.hasPrefix(NotificationKeys.identifierPrefix) else {
        return false
      }
      return request.content.userInfo[NotificationKeys.taskId] as? String == taskId
    }
    let intents = try matches.map { request -> StoredIntent in
      let payload = request.content.userInfo
      guard
        let payloadTaskId = payload[NotificationKeys.taskId] as? String,
        payloadTaskId == taskId,
        let ruleId = payload[NotificationKeys.ruleId] as? String,
        let kind = payload[NotificationKeys.reminderKind] as? String,
        let triggerAt = payload[NotificationKeys.triggerAt] as? String
      else {
        throw NotificationBridgeError.corrupt("pending request")
      }
      let intent = StoredIntent(
        taskId: payloadTaskId,
        ruleId: ruleId,
        kind: kind,
        triggerAt: triggerAt
      )
      guard request.identifier == intent.stableId, parseDate(triggerAt) != nil else {
        throw NotificationBridgeError.corrupt("pending identifier")
      }
      return intent
    }
    return sorted(intents)
  }

  private func cancel(_ intents: [StoredIntent]) {
    let identifiers = Array(Set(intents.map(\.stableId)))
    center.removePendingNotificationRequests(withIdentifiers: identifiers)
    center.removeDeliveredNotifications(withIdentifiers: identifiers)
  }

  private func install(_ snapshot: StoredSnapshot) async throws {
    if snapshot.scheduled {
      for intent in snapshot.intents {
        try await center.add(request(intent))
      }
    }
  }

  private func verify(_ snapshot: StoredSnapshot?) async throws {
    guard let snapshot, snapshot.scheduled else {
      if let taskId = snapshot?.taskId, !(try await actualIntents(taskId)).isEmpty {
        throw NotificationBridgeError.recovery("unexpected pending requests")
      }
      return
    }
    if try await actualIntents(snapshot.taskId) != sorted(snapshot.intents) {
      throw NotificationBridgeError.recovery("pending request drift")
    }
  }

  private func applyTarget(_ target: StoredSnapshot?, taskId: String) async throws {
    cancel(try await actualIntents(taskId))
    if let target, target.scheduled {
      try await install(target)
    }
    try await verify(target ?? StoredSnapshot(
      taskId: taskId,
      generation: 0,
      permission: "denied",
      intents: [],
      scheduled: false,
      needsRecovery: false
    ))
    if let target, target.scheduled {
      try persistence.saveSnapshot(target.withRecovery(false))
    } else {
      persistence.removeSnapshot(taskId)
    }
  }

  private func recoverIfNeeded(_ taskId: String) async throws {
    guard let journal = try persistence.journal(taskId) else {
      return
    }
    let target = journal.phase == .committed ? journal.next : journal.durablePrevious
    do {
      try await applyTarget(target, taskId: taskId)
      persistence.removeJournal(taskId)
    } catch {
      let marker = (target ?? journal.next).withRecovery(true)
      try? persistence.saveSnapshot(marker)
      throw NotificationBridgeError.recovery("journal")
    }
  }

  private func replaceAtomically(
    _ suppliedPrevious: StoredSnapshot?,
    _ next: StoredSnapshot
  ) async throws {
    let durablePrevious = try persistence.snapshot(next.taskId)
    let actualPrevious = try await actualIntents(next.taskId)
    let journal = ReplacementJournal(
      taskId: next.taskId,
      durablePrevious: durablePrevious,
      next: next,
      phase: .applying
    )
    try persistence.saveJournal(journal)

    do {
      let affected = (suppliedPrevious?.intents ?? []) +
        (durablePrevious?.intents ?? []) + actualPrevious
      cancel(affected)
      try await install(next)
      try await verify(next)
      if next.scheduled {
        try persistence.saveSnapshot(next.withRecovery(false))
      } else {
        persistence.removeSnapshot(next.taskId)
      }
      try persistence.saveJournal(journal.withPhase(.committed))
      persistence.removeJournal(next.taskId)
    } catch {
      do {
        cancel(next.intents)
        try await applyTarget(durablePrevious, taskId: next.taskId)
        persistence.removeJournal(next.taskId)
      } catch {
        let recoveryIntents = Array(
          Set((actualPrevious + next.intents).map(\.stableId))
        )
        let intents = (actualPrevious + next.intents).filter { intent in
          recoveryIntents.contains(intent.stableId)
        }
        try? persistence.saveSnapshot(
          StoredSnapshot(
            taskId: next.taskId,
            generation: next.generation,
            permission: next.permission,
            intents: sorted(intents),
            scheduled: !intents.isEmpty,
            needsRecovery: true
          )
        )
      }
      throw error
    }
  }
}
