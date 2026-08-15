import Foundation
import React
import UIKit
import UniformTypeIdentifiers

private enum BackupFileError: Error {
  case invalid(String)
  case io(String)
}

@objc(StartFiveBackupFiles)
final class StartFiveBackupFiles: NSObject, RCTInvalidating,
  UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private static let maximumBytes = 8 * 1024 * 1024

  private enum Operation {
    case exporting(
      id: UUID,
      resolve: RCTPromiseResolveBlock,
      reject: RCTPromiseRejectBlock,
      temporaryDirectory: URL
    )
    case importing(
      id: UUID,
      resolve: RCTPromiseResolveBlock,
      reject: RCTPromiseRejectBlock
    )

    var id: UUID {
      switch self {
      case let .exporting(id, _, _, _), let .importing(id, _, _): return id
      }
    }
  }

  private var operation: Operation?
  private var isInvalidated = false

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(saveBackup:bytesBase64:resolver:rejecter:)
  func saveBackup(
    _ suggestedName: String,
    bytesBase64: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [self] in
      guard !isInvalidated else {
        reject("BACKUP_FILE_MODULE_INVALIDATED", "The backup file module was invalidated.", nil)
        return
      }
      guard operation == nil else {
        reject("BACKUP_FILE_BUSY", "Another backup file operation is active.", nil)
        return
      }

      do {
        let data = try Self.decodeStrictBase64(bytesBase64)
        let directory = try Self.makeTemporaryDirectory()
        do {
          let fileURL = directory.appendingPathComponent(
            Self.sanitizedDisplayName(suggestedName),
            isDirectory: false
          )
          try data.write(to: fileURL, options: .atomic)
          operation = .exporting(
            id: UUID(),
            resolve: resolve,
            reject: reject,
            temporaryDirectory: directory
          )
          let picker = UIDocumentPickerViewController(
            forExporting: [fileURL],
            asCopy: true
          )
          picker.delegate = self
          try present(picker, operationID: operation!.id)
        } catch {
          try? FileManager.default.removeItem(at: directory)
          throw error
        }
      } catch {
        reject("BACKUP_FILE_SAVE_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(pickBackup:rejecter:)
  func pickBackup(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [self] in
      guard !isInvalidated else {
        reject("BACKUP_FILE_MODULE_INVALIDATED", "The backup file module was invalidated.", nil)
        return
      }
      guard operation == nil else {
        reject("BACKUP_FILE_BUSY", "Another backup file operation is active.", nil)
        return
      }
      do {
        operation = .importing(id: UUID(), resolve: resolve, reject: reject)
        let picker = UIDocumentPickerViewController(
          forOpeningContentTypes: [.json],
          asCopy: true
        )
        picker.delegate = self
        try present(picker, operationID: operation!.id)
      } catch {
        operation = nil
        reject("BACKUP_FILE_PICK_FAILED", error.localizedDescription, error)
      }
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finishCancellation()
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finishCancellation()
  }

  @objc func invalidate() {
    if Thread.isMainThread {
      finishInvalidated()
    } else {
      DispatchQueue.main.sync { self.finishInvalidated() }
    }
  }

  deinit {
    guard let current = operation else { return }
    operation = nil
    rejectAndCleanUp(
      current,
      code: "BACKUP_FILE_MODULE_INVALIDATED",
      message: "The backup file module was invalidated."
    )
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard let current = operation else { return }
    switch current {
    case let .exporting(_, resolve, _, temporaryDirectory):
      operation = nil
      try? FileManager.default.removeItem(at: temporaryDirectory)
      resolve("saved")

    case let .importing(operationID, resolve, reject):
      guard urls.count == 1, let url = urls.first else {
        operation = nil
        reject("BACKUP_FILE_PICK_FAILED", "Exactly one backup file is required.", nil)
        return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.readCoordinated(url)
          DispatchQueue.main.async {
            guard self.operation?.id == operationID else { return }
            self.operation = nil
            resolve([
              "name": Self.sanitizedDisplayName(url.lastPathComponent),
              "bytesBase64": result.base64EncodedString(),
            ])
          }
        } catch {
          DispatchQueue.main.async {
            guard self.operation?.id == operationID else { return }
            self.operation = nil
            reject("BACKUP_FILE_PICK_FAILED", error.localizedDescription, error)
          }
        }
      }
    }
  }

  private func finishCancellation() {
    guard let current = operation else { return }
    operation = nil
    switch current {
    case let .exporting(_, resolve, _, temporaryDirectory):
      try? FileManager.default.removeItem(at: temporaryDirectory)
      resolve("cancelled")
    case let .importing(_, resolve, _):
      resolve(nil)
    }
  }

  private func finishInvalidated() {
    isInvalidated = true
    guard let current = operation else { return }
    operation = nil
    rejectAndCleanUp(
      current,
      code: "BACKUP_FILE_MODULE_INVALIDATED",
      message: "The backup file module was invalidated."
    )
  }

  private func rejectAndCleanUp(
    _ current: Operation,
    code: String,
    message: String
  ) {
    switch current {
    case let .exporting(_, _, reject, temporaryDirectory):
      try? FileManager.default.removeItem(at: temporaryDirectory)
      reject(code, message, nil)
    case let .importing(_, _, reject):
      reject(code, message, nil)
    }
  }

  private func present(
    _ picker: UIDocumentPickerViewController,
    operationID: UUID
  ) throws {
    guard let presenter = Self.topViewController() else {
      operation = nil
      throw BackupFileError.io("No active view controller is available.")
    }
    guard
      presenter.viewIfLoaded?.window != nil,
      presenter.presentedViewController == nil,
      !presenter.isBeingDismissed,
      !presenter.isBeingPresented
    else {
      operation = nil
      throw BackupFileError.io("The active view controller cannot present a document picker.")
    }
    presenter.present(picker, animated: true) {
      picker.presentationController?.delegate = self
    }
    picker.presentationController?.delegate = self
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self, weak picker] in
      guard
        let self,
        self.operation?.id == operationID,
        picker?.presentingViewController == nil
      else { return }
      let current = self.operation
      self.operation = nil
      if let current {
        self.rejectAndCleanUp(
          current,
          code: "BACKUP_FILE_PRESENTATION_FAILED",
          message: "The document picker could not be presented."
        )
      }
    }
  }

  private static func decodeStrictBase64(_ value: String) throws -> Data {
    guard value.utf8.count <= ((maximumBytes + 2) / 3) * 4 else {
      throw BackupFileError.invalid("Backup file exceeds 8 MiB.")
    }
    guard
      value.range(
        of: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
        options: .regularExpression
      ) != nil,
      let data = Data(base64Encoded: value, options: []),
      data.count <= maximumBytes,
      data.base64EncodedString() == value
    else {
      throw BackupFileError.invalid("Backup bytes are not strict base64 or exceed 8 MiB.")
    }
    return data
  }

  private static func makeTemporaryDirectory() throws -> URL {
    let root = FileManager.default.urls(
      for: .cachesDirectory,
      in: .userDomainMask
    )[0].appendingPathComponent("StartFiveBackupFiles", isDirectory: true)
    try FileManager.default.createDirectory(
      at: root,
      withIntermediateDirectories: true,
      attributes: nil
    )
    let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: false,
      attributes: nil
    )
    return directory
  }

  private static func readCoordinated(_ url: URL) throws -> Data {
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }

    var coordinationError: NSError?
    var readResult: Result<Data, Error>?
    NSFileCoordinator().coordinate(
      readingItemAt: url,
      options: .withoutChanges,
      error: &coordinationError
    ) { coordinatedURL in
      do {
        let values = try coordinatedURL.resourceValues(
          forKeys: [.isRegularFileKey, .fileSizeKey]
        )
        guard values.isRegularFile != false else {
          throw BackupFileError.invalid("The selected item is not a regular file.")
        }
        if let size = values.fileSize, size > maximumBytes {
          throw BackupFileError.invalid("Backup file exceeds 8 MiB.")
        }
        let handle = try FileHandle(forReadingFrom: coordinatedURL)
        defer { try? handle.close() }
        var data = Data()
        while true {
          let chunk = try handle.read(upToCount: 64 * 1024) ?? Data()
          if chunk.isEmpty { break }
          guard chunk.count <= maximumBytes - data.count else {
            throw BackupFileError.invalid("Backup file exceeds 8 MiB.")
          }
          data.append(chunk)
        }
        readResult = .success(data)
      } catch {
        readResult = .failure(error)
      }
    }
    if let coordinationError { throw coordinationError }
    guard let readResult else {
      throw BackupFileError.io("The selected backup file could not be read.")
    }
    return try readResult.get()
  }

  private static func sanitizedDisplayName(_ value: String) -> String {
    let leaf = (value as NSString).lastPathComponent
    let forbidden = CharacterSet.controlCharacters.union(
      CharacterSet(charactersIn: "/\\:")
    )
    let filtered = leaf.unicodeScalars
      .map { forbidden.contains($0) ? "_" : String($0) }
      .joined()
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let usable = filtered.isEmpty || filtered == "." || filtered == ".."
      ? "start-five-backup.json"
      : filtered
    return String(usable.prefix(120))
  }

  private static func topViewController() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
    var current = window?.rootViewController
    while true {
      if current?.presentedViewController != nil {
        return nil
      } else if let navigation = current as? UINavigationController {
        current = navigation.visibleViewController
      } else if let tab = current as? UITabBarController {
        current = tab.selectedViewController
      } else {
        return current
      }
    }
  }
}

extension BackupFileError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case let .invalid(message), let .io(message): return message
    }
  }
}
