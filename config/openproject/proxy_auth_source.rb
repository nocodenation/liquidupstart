# frozen_string_literal: true

#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++

# ProxyAuthSource encapsulates creating or finding a local user based on
# proxy-provided headers used by AuthSourceSSO, similar to LdapAuthSource.
module ProxyAuthSource
  module_function

  # Finds an existing user or creates one from provided headers/config
  #
  # @param login [String] The login identifier extracted from the SSO header
  # @param headers [#[]] A headers-like object (e.g., ActionDispatch::Http::Headers)
  # @param config [Hash, ActiveSupport::HashWithIndifferentAccess] SSO configuration
  #   supporting keys :email_header and :name_header
  # @return [User, nil]
  def find_user(login, headers:, config: {})
    user = find_existing_user(login)
    return user if user.present?

    attrs = build_user_attributes(login, headers, config)

    repurposed = try_repurpose_initial_admin(login, attrs)
    return repurposed if repurposed.present?

    create_new_user(attrs)
  end

  # Attempts to find an existing user by login or email
  # @param login [String]
  # @return [User, nil]
  def find_existing_user(login)
    User.by_login(login).first || User.find_by_mail(login)
  end

  # Builds user attributes (login, firstname, lastname, optional mail) from headers/config
  # @param login [String]
  # @param headers [#[]]
  # @param config [Hash]
  # @return [Hash]
  def build_user_attributes(login, headers, config)
    name_header  = "X-Authentication-Name"

    full_name = name_header.present? ? to_s(headers[name_header]).strip : ""
    firstname, lastname = extract_first_last_from_full_name(full_name)

    firstname = (firstname.presence || login).to_s
    lastname = (lastname.presence || "-").to_s

    { login: login, mail: login, firstname: firstname, lastname: lastname }
  end

  # Repurposes the initial admin user if it's the only non-builtin user
  # using the provided attributes. Returns the updated user or nil.
  # @param login [String]
  # @param attrs [Hash]
  # @return [User, nil]
  def try_repurpose_initial_admin(login, attrs)
    begin
      # Repurpose the initial admin if it still exists with login 'admin' (case-insensitive)
      admin_user = User.where("LOWER(login) = ?", "admin").first

      if admin_user&.admin?
        Rails.logger.info("Repurposing initial admin user with SSO-provided credentials for '#{login}'")

        update_attrs = {
          login: login,
          mail: (attrs[:mail] || login),
          firstname: attrs[:firstname],
          lastname: attrs[:lastname]
        }

        update_call = Users::SetAttributesService
                        .new(model: admin_user, user: User.system, contract_class: Users::UpdateContract)
                        .call(update_attrs)

        repurposed = update_call.result

        repurposed.activate

        # Set a random password WITHOUT forcing a password change on next login
        random = OpenProject::Passwords::Generator.random_password
        repurposed.password = random
        repurposed.password_confirmation = random
        repurposed.force_password_change = false if repurposed.respond_to?(:force_password_change)

        return repurposed if repurposed.save

        Rails.logger.error "Failed to repurpose initial admin user for '#{login}': #{repurposed.errors.full_messages.join(', ')}"
      else
        Rails.logger.debug("Skipping admin repurpose: No admin user with login 'admin' found")
      end
    rescue => e
      Rails.logger.error("Error while attempting to repurpose initial admin user: #{e.class}: #{e.message}")
      # Fall through to creating a new user
    end

    nil
  end

  # Creates a new local user with the given attributes, activates it, and returns it.
  # Returns nil if creation fails (and logs the error).
  # @param attrs [Hash]
  # @return [User, nil]
  def create_new_user(attrs)
    create_attrs = { login: attrs[:login], firstname: attrs[:firstname], lastname: attrs[:lastname] }
    create_attrs[:mail] = attrs[:mail] if attrs.key?(:mail)

    call = Users::SetAttributesService
             .new(model: User.new, user: User.system, contract_class: Users::CreateContract)
             .call(create_attrs)

    new_user = call.result

    # Ensure the user has a password, even if not used, to satisfy validations
    new_user.random_password! if new_user.respond_to?(:random_password!)

    # Activate the user right away so SSO can log them in
    new_user.activate

    if new_user.save
      new_user
    else
      Rails.logger.error "Tried to create local user '#{attrs[:login]}' from SSO headers but failed: #{new_user.errors.full_messages.join(', ')}"
      nil
    end
  end

  # Splits a full name into first and last name; returns [nil, nil] if blank
  # @param full_name [String]
  # @return [Array(String, String)]
  def extract_first_last_from_full_name(full_name)
    return [nil, nil] if full_name.blank?

    parts = full_name.split(/\s+/, 2)
    [parts[0], parts[1]]
  end

  def to_s(value)
    String(value)
  end

  def to_s_or_nil(value)
    value.respond_to?(:to_s) ? value.to_s : nil
  end
end